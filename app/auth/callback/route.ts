import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase Auth (login) OAuth callback — distinct from
// app/auth/gmail/callback/route.ts, which handles the separate
// gmail.readonly data-access consent flow (FR-01-02).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
