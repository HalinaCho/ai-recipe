"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

// FR-01-04 step-by-step wizard shell. Screenshot assets and the real
// IMAP app-password verification call are M1 scope — this establishes the
// step structure and copy so M1 only needs to drop in images + wire the API.
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
    body: "2단계 인증용 앱 비밀번호를 발급받아 아래에 입력해주세요.",
  },
] as const;

export default function NaverConnectPage() {
  const [step, setStep] = useState(0);
  const [appPassword, setAppPassword] = useState("");
  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="flex flex-1 flex-col gap-6">
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

      <Card className="flex-1 flex flex-col justify-center gap-3">
        <p className="text-label-sm text-on-surface-variant">
          {step + 1} / {STEPS.length}
        </p>
        <p className="text-headline-md text-on-surface">
          {STEPS[step].title}
        </p>
        <p className="text-body-md text-on-surface-variant">
          {STEPS[step].body}
        </p>

        {isLastStep && (
          <Input
            type="password"
            placeholder="앱 비밀번호 입력"
            value={appPassword}
            onChange={(e) => setAppPassword(e.target.value)}
            className="mt-2"
          />
        )}
      </Card>

      <div className="flex gap-3">
        {step > 0 && (
          <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
            이전
          </Button>
        )}
        <Button
          className="flex-1"
          disabled={isLastStep && !appPassword.trim()}
          onClick={() =>
            isLastStep
              ? undefined // M1: POST to /api/mail-connections (naver)
              : setStep((s) => s + 1)
          }
        >
          {isLastStep ? "연결 완료" : "다음"}
        </Button>
      </div>
    </div>
  );
}
