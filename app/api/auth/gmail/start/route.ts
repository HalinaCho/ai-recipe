import { NextResponse } from "next/server";

// M0 scaffolding stub. M1 replaces this with a redirect to Google's OAuth
// consent screen for a SEPARATE Google Cloud client requesting
// gmail.readonly (access_type=offline&prompt=consent), with `state` set to
// the current household/member id. Must never reuse the login OAuth
// client (FR-01-02).
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(
    `${origin}/mail-connect/gmail?status=not_implemented`,
  );
}
