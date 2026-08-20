import { NextResponse } from "next/server";

// M0 scaffolding stub for the Gmail DATA-ACCESS OAuth callback — separate
// from app/auth/callback/route.ts (Supabase Auth login). M1 exchanges
// `code` for a gmail.readonly refresh token here, verifies `state` against
// the active session's household/member id, and stores the encrypted
// token on a mail_connection row. Never conflate this with login.
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(
    `${origin}/mail-connect/gmail?status=not_implemented`,
  );
}
