import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import {
  GMAIL_OAUTH_STATE_COOKIE,
  GMAIL_READONLY_SCOPE,
  createGmailAdapter,
  createGmailOAuthClient,
  decodeGmailOAuthState,
} from "@/lib/mail-adapters/gmail";
import { createClient } from "@/lib/supabase/server";

// Gmail DATA-ACCESS OAuth callback (FR-01-02) — distinct from
// app/auth/callback/route.ts, which handles Supabase Auth login. Nothing
// here touches the user's session; it only exchanges the consent code for a
// gmail.readonly refresh token and stores it encrypted (NFR-03).

function redirectTo(origin: string, path: string) {
  const response = NextResponse.redirect(`${origin}${path}`);
  // The state nonce is single-use whatever the outcome.
  response.cookies.delete(GMAIL_OAUTH_STATE_COOKIE);
  return response;
}

function fail(origin: string, reason: string) {
  return redirectTo(origin, `/mail-connect/gmail?error=${reason}`);
}

function nonceMatches(expected: string | undefined, actual: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);

  // User pressed "취소" on Google's consent screen.
  if (searchParams.get("error")) {
    return fail(origin, "denied");
  }

  const code = searchParams.get("code");
  const rawState = searchParams.get("state");
  if (!code || !rawState) {
    return fail(origin, "invalid_request");
  }

  const state = decodeGmailOAuthState(rawState);
  if (!state) {
    return fail(origin, "invalid_state");
  }

  // CSRF: the nonce must match the httpOnly cookie set when the flow began.
  const cookieNonce = (await cookies()).get(GMAIL_OAUTH_STATE_COOKIE)?.value;

  if (!nonceMatches(cookieNonce, state.nonce)) {
    return fail(origin, "invalid_state");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectTo(origin, "/login");
  }
  // The flow must finish in the same login session that started it.
  if (user.id !== state.userId) {
    return fail(origin, "invalid_state");
  }

  // And the member/household pair from the state must still be this user's.
  const { data: member } = await supabase
    .from("member")
    .select("id, household_id")
    .eq("id", state.memberId)
    .eq("user_id", user.id)
    .eq("household_id", state.householdId)
    .maybeSingle();

  if (!member) {
    return fail(origin, "invalid_state");
  }

  let refreshToken: string;
  let grantedScope: string;
  try {
    const { tokens } = await createGmailOAuthClient().getToken(code);
    if (!tokens.refresh_token) {
      // Google only re-issues a refresh token with prompt=consent; if it's
      // missing the user likely has a stale grant to revoke.
      return fail(origin, "no_refresh_token");
    }
    refreshToken = tokens.refresh_token;
    grantedScope = tokens.scope ?? "";
  } catch {
    return fail(origin, "exchange_failed");
  }

  if (grantedScope && !grantedScope.split(" ").includes(GMAIL_READONLY_SCOPE)) {
    return fail(origin, "missing_scope");
  }

  // Confirms the token works and tells us which Gmail address was granted —
  // which may be a different Google account than the login one (FR-01-01).
  const check = await createGmailAdapter({
    provider: "gmail",
    emailAddress: "",
    secret: refreshToken,
  }).verifyConnection();

  if (!check.ok || !check.emailAddress) {
    return fail(origin, "verify_failed");
  }

  let encryptedSecret: string;
  try {
    encryptedSecret = encryptSecret(refreshToken); // NFR-03
  } catch {
    return fail(origin, "config");
  }

  // No unique constraint on (household_id, provider, email_address) exists
  // yet, so re-connecting the same mailbox is an explicit update rather
  // than an upsert — this also revives a previously expired connection.
  const { data: existing } = await supabase
    .from("mail_connection")
    .select("id")
    .eq("household_id", member.household_id)
    .eq("provider", "gmail")
    .eq("email_address", check.emailAddress)
    .maybeSingle();

  const { error: writeError } = existing
    ? await supabase
        .from("mail_connection")
        .update({
          encrypted_secret: encryptedSecret,
          connected_by_member_id: member.id,
          status: "active",
        })
        .eq("id", existing.id)
    : await supabase.from("mail_connection").insert({
        household_id: member.household_id,
        connected_by_member_id: member.id,
        provider: "gmail",
        email_address: check.emailAddress,
        auth_type: "oauth",
        encrypted_secret: encryptedSecret,
        status: "active",
      });

  if (writeError) {
    return fail(origin, "save_failed");
  }

  return redirectTo(origin, "/syncing");
}
