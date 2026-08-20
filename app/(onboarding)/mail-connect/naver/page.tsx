"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type {
  CreateMailConnectionResponse,
  CreateNaverMailConnectionRequest,
} from "@/types/api";

// FR-01-04 단계별 가이드. 네이버메일은 OAuth가 없어 사용자가 직접 IMAP을 켜고
// 앱 비밀번호를 발급해야 하므로, 그 과정을 한 화면에 하나씩만 보여준다.
const STEPS = [
  { title: "네이버메일 접속", body: "네이버메일에 로그인해주세요." },
  { title: "환경설정 이동", body: "메일 화면 우측 상단 [환경설정]을 눌러주세요." },
  {
    title: "POP3/IMAP 설정",
    body: "왼쪽 메뉴에서 [POP3/IMAP 설정]을 선택해주세요.",
  },
  { title: "IMAP 사용 켜기", body: "IMAP/SMTP 사용을 [사용함]으로 켜주세요." },
  {
    title: "앱 비밀번호 발급",
    body: "2단계 인증을 쓰신다면 앱 비밀번호를 발급받아 입력해주세요. 안 쓰신다면 네이버 로그인 비밀번호를 그대로 넣으시면 돼요.",
  },
] as const;

export default function NaverConnectPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [emailAddress, setEmailAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLastStep = step === STEPS.length - 1;
  const canSubmit = emailAddress.trim() !== "" && appPassword.trim() !== "";

  const handleConnect = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/mail-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailAddress: emailAddress.trim(),
          appPassword,
        } satisfies CreateNaverMailConnectionRequest),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "네이버메일에 연결하지 못했어요.");
      }

      (await res.json()) as CreateMailConnectionResponse;
      router.push("/syncing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류가 났어요.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6">
      <div className="flex gap-1">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i <= step ? "bg-primary" : "bg-outline-variant"
            }`}
          />
        ))}
      </div>

      <Card className="flex flex-1 flex-col justify-center gap-3 p-5">
        <p className="text-label-sm text-on-surface-variant">
          {step + 1} / {STEPS.length}
        </p>
        <p className="text-headline-md text-on-surface">{STEPS[step].title}</p>
        <p className="text-body-md text-on-surface-variant">
          {STEPS[step].body}
        </p>

        {isLastStep && (
          <div className="mt-2 flex flex-col gap-3">
            <Input
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="네이버 메일 주소 (예: hong@naver.com)"
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="앱 비밀번호"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
            />
            <p className="text-label-md text-on-surface-variant">
              주문내역 메일만 읽어요. 메일을 보내거나 지우지 않아요.
            </p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-2 rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"
          >
            {error}
          </p>
        )}
      </Card>

      <div className="flex gap-3">
        {step > 0 && (
          <Button
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => setStep((s) => s - 1)}
          >
            이전
          </Button>
        )}
        <Button
          className="flex-1"
          disabled={isLastStep ? !canSubmit || isSubmitting : false}
          onClick={() => (isLastStep ? handleConnect() : setStep((s) => s + 1))}
        >
          {isLastStep ? (isSubmitting ? "연결하는 중..." : "연결 완료") : "다음"}
        </Button>
      </div>
    </div>
  );
}
