"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function InventoryListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex min-h-[76px] animate-pulse items-center gap-4 rounded-xl bg-surface-container-lowest p-3 shadow-tinted"
        >
          <span className="h-12 w-12 shrink-0 rounded-full bg-surface-container" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-4 w-24 rounded-full bg-surface-container" />
            <span className="h-3 w-40 rounded-full bg-surface-container-low" />
          </span>
          <span className="h-6 w-14 rounded-full bg-surface-container" />
        </div>
      ))}
      <span className="sr-only">재고를 불러오는 중이에요</span>
    </div>
  );
}

export function InventoryErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-2xl text-error">
          sentiment_dissatisfied
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-body-lg text-on-surface">
            재고를 불러오지 못했어요
          </p>
          <p className="text-body-md text-on-surface-variant">{message}</p>
        </div>
      </div>
      <Button variant="secondary" onClick={onRetry} className="w-full">
        다시 시도하기
      </Button>
    </Card>
  );
}

/** A household that hasn't synced yet — the most common first-run state. */
export function InventoryEmptyState() {
  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center">
      <span className="text-6xl" aria-hidden>
        🧊
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-headline-md text-on-surface">
          아직 담긴 재료가 없어요
        </p>
        <p className="text-body-md text-on-surface-variant">
          메일함을 연결하면 주문한 식재료가 자동으로 여기에 쌓여요. 오래 둔
          재료부터 차례로 보여드릴게요.
        </p>
      </div>
      <Link href="/settings/mail-connections" className="w-full">
        <Button className="w-full">메일함 연결하기</Button>
      </Link>
    </Card>
  );
}
