"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Login only — never request gmail.readonly here (FR-01-02).
        // Gmail data access is a separate consent flow started from
        // /mail-connect/gmail.
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <p className="text-headline-lg text-on-surface">
        구글 계정으로 로그인
      </p>
      <p className="text-body-md text-on-surface-variant max-w-xs">
        로그인 계정과 메일 연동(Gmail) 계정은 별개예요. 메일 연동은 다음
        단계에서 따로 진행해요.
      </p>
      <Button onClick={handleGoogleLogin} className="w-full max-w-xs">
        Google로 계속하기
      </Button>
    </div>
  );
}
