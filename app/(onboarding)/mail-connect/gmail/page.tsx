"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

// Kicks off the gmail.readonly consent flow (FR-01-02) — a Google OAuth
// client separate from the login one. The route handler derives the
// household from the session, so nothing sensitive travels from here.

const ERROR_MESSAGES: Record<string, string> = {
  config:
    "Gmail 연결 설정이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.",
  denied:
    "권한 허용이 취소됐어요. 주문내역 메일을 읽으려면 권한이 필요해요.",
  invalid_request: "연결 요청이 올바르지 않아요. 처음부터 다시 시도해주세요.",
  invalid_state: "연결 요청이 만료됐어요. 다시 시도해주세요.",
  no_refresh_token:
    "권한이 완전히 전달되지 않았어요. 구글 계정에서 기존 권한을 삭제한 뒤 다시 시도해주세요.",
  exchange_failed: "구글 연결에 실패했어요. 잠시 후 다시 시도해주세요.",
  missing_scope: "메일 읽기 권한에 동의해야 주문내역을 가져올 수 있어요.",
  verify_failed: "메일함 확인에 실패했어요. 다시 시도해주세요.",
  save_failed: "연결 정보를 저장하지 못했어요. 다시 시도해주세요.",
  household_lookup_failed: "가구 정보를 불러오지 못했어요. 다시 시도해주세요.",
};

const FALLBACK_ERROR = "연결에 실패했어요. 다시 시도해주세요.";

function GmailConnect() {
  const searchParams = useSearchParams();
  const [isStarting, setIsStarting] = useState(false);

  const errorCode = searchParams.get("error");
  const errorMessage = errorCode
    ? (ERROR_MESSAGES[errorCode] ?? FALLBACK_ERROR)
    : null;

  const handleConnect = () => {
    setIsStarting(true);
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
      {errorMessage && (
        <p
          role="alert"
          className="text-body-md text-on-error-container bg-error-container rounded-xl px-4 py-3 max-w-xs"
        >
          {errorMessage}
        </p>
      )}
      <Button
        onClick={handleConnect}
        disabled={isStarting}
        className="w-full max-w-xs"
      >
        {isStarting ? "구글로 이동 중..." : "Gmail 권한 허용하기"}
      </Button>
    </div>
  );
}

export default function GmailConnectPage() {
  // useSearchParams needs a Suspense boundary to keep this route
  // prerenderable.
  return (
    <Suspense>
      <GmailConnect />
    </Suspense>
  );
}
