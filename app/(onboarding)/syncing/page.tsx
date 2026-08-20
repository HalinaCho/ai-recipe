"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SyncProgressBar } from "@/components/inventory/SyncPanel";
import { useSync } from "@/lib/hooks/use-sync";

// 첫 동기화 (§4.1 온보딩). 예전 화면은 스피너만 돌았지만, 이제 실제로
// POST /api/sync 를 호출하고 끝나면 완료 화면으로 넘어간다.
const STEPS = [
  "메일함에 들어가는 중이에요",
  "주문내역 메일을 찾고 있어요",
  "산 재료를 하나씩 정리하고 있어요",
  "거의 다 됐어요",
];

export default function SyncingPage() {
  const router = useRouter();
  const sync = useSync();
  const started = useRef(false);
  const [step, setStep] = useState(0);

  const { mutate, isPending, isError, error, data } = sync;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate();
  }, [mutate]);

  useEffect(() => {
    if (!isPending) return;
    const timer = setInterval(
      () => setStep((current) => Math.min(current + 1, STEPS.length - 1)),
      2500,
    );
    return () => clearInterval(timer);
  }, [isPending]);

  const failed = data?.connections.filter((c) => c.status === "failed") ?? [];
  const allFailed =
    data !== undefined &&
    data.connections.length > 0 &&
    failed.length === data.connections.length;

  useEffect(() => {
    if (!data || allFailed) return;
    router.replace(
      `/complete?mails=${data.processedMailCount}&items=${data.addedItemCount}`,
    );
  }, [data, allFailed, router]);

  const finishedWithProblem = isError || allFailed;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      {!finishedWithProblem && (
        <>
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary-container border-t-primary" />
          <p className="text-headline-md text-on-surface">
            주문내역을 불러오는 중이에요
          </p>
          <p className="max-w-xs text-body-md text-on-surface-variant">
            메일함에서 최근 주문내역을 찾아 재고로 정리하고 있어요. 잠시만
            기다려주세요.
          </p>
          <div className="w-full max-w-xs">
            <SyncProgressBar label={STEPS[step]} />
          </div>
        </>
      )}

      {finishedWithProblem && (
        <Card className="flex w-full max-w-xs flex-col gap-4 p-5 text-left">
          <div className="flex flex-col gap-1">
            <p className="text-headline-md text-on-surface">
              메일함을 읽지 못했어요
            </p>
            <p className="text-body-md text-on-surface-variant">
              {isError && error instanceof Error
                ? error.message
                : "연결한 메일함에서 주문내역을 가져오지 못했어요."}
            </p>
          </div>

          {failed.map((connection) => (
            <div
              key={connection.mailConnectionId}
              className="rounded-xl bg-error-container p-3"
            >
              <p className="text-body-md text-on-error-container">
                {connection.emailAddress}
              </p>
              {connection.error && (
                <p className="text-label-md text-on-error-container/80">
                  {connection.error}
                </p>
              )}
            </div>
          ))}

          <div className="flex flex-col gap-2">
            <Button
              className="w-full"
              disabled={isPending}
              onClick={() => mutate()}
            >
              {isPending ? "다시 확인하는 중..." : "다시 시도하기"}
            </Button>
            <Link href="/mail-connect" className="w-full">
              <Button variant="secondary" className="w-full">
                메일 다시 연결하기
              </Button>
            </Link>
            <Link href="/home" className="w-full">
              <Button variant="ghost" className="w-full">
                나중에 할게요
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
