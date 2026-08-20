"use client";

import { Button } from "@/components/ui/Button";

// M0 scaffolding only — real gmail.readonly OAuth flow (a client distinct
// from the login Google client, per FR-01-02) is implemented in M1.
export default function GmailConnectPage() {
  const handleConnect = () => {
    window.location.href = "/api/auth/gmail/start";
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <span className="material-symbols-outlined text-5xl text-primary">
        mail
      </span>
      <p className="text-headline-lg text-on-surface">Gmail 연결하기</p>
      <p className="text-body-md text-on-surface-variant max-w-xs">
        주문내역 메일만 읽기 전용으로 가져와요. 메일 본문은 저장하지
        않아요.
      </p>
      <Button onClick={handleConnect} className="w-full max-w-xs">
        Gmail 권한 허용하기
      </Button>
    </div>
  );
}
