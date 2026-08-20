import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import {
  GMAIL_OAUTH_STATE_COOKIE,
  GMAIL_READONLY_SCOPE,
  createGmailOAuthClient,
  encodeGmailOAuthState,
} from "@/lib/mail-adapters/gmail";
import { createClient } from "@/lib/supabase/server";

// FR-01-02: the Gmail DATA-ACCESS consent flow. This is a separate Google
// Cloud OAuth client from the login one (Supabase Auth's Google provider,
// app/auth/callback/route.ts) and asks only for gmail.readonly.
//
// The Gmail account the user picks here may be a different Google account
// than the one they logged in with — a couple connecting both mailboxes is
// an expected case (FR-01-01), so nothing downstream compares the two.

const STATE_TTL_SECONDS = 60 * 10;

function fail(origin: string, reason: string) {
  return NextResponse.redirect(`${origin}/mail-connect/gmail?error=${reason}`);
}

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // The household the connection will belong to, taken from the session's
  // own member row — never from a query param the caller controls.
  const { data: member, error: memberError } = await supabase
    .from("member")
    .select("id, household_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memberError) {
    return fail(origin, "household_lookup_failed");
  }
  if (!member) {
    return NextResponse.redirect(`${origin}/household`);
  }

  let authUrl: string;
  const nonce = randomBytes(32).toString("base64url");
  try {
    authUrl = createGmailOAuthClient().generateAuthUrl({
      // offline + consent is what actually yields a refresh token; without
      // prompt=consent Google omits it on every re-authorization.
      access_type: "offline",
      prompt: "consent",
      scope: [GMAIL_READONLY_SCOPE],
      include_granted_scopes: false,
      state: encodeGmailOAuthState({
        nonce,
        userId: user.id,
        householdId: member.household_id,
        memberId: member.id,
      }),
    });
  } catch {
    // Missing GMAIL_OAUTH_* env — surface it as a page-level message
    // instead of a 500.
    return fail(origin, "config");
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax", // must survive Google's top-level redirect back
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
  return response;
}
