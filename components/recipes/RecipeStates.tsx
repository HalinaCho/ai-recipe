"use client";

import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useInventory } from "@/lib/hooks/use-inventory";

export function RecipeListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-tinted"
        >
          <div className="flex items-center gap-3">
            <span className="h-12 w-12 shrink-0 rounded-full bg-surface-container" />
            <span className="flex flex-1 flex-col gap-2">
              <span className="h-4 w-32 rounded-full bg-surface-container" />
              <span className="h-3 w-24 rounded-full bg-surface-container-low" />
            </span>
          </div>
          <span className="h-3 w-full rounded-full bg-surface-container" />
          <span className="h-3 w-40 rounded-full bg-surface-container-low" />
        </div>
      ))}
      <span className="sr-only">레시피를 고르는 중이에요</span>
    </div>
  );
}

export function RecipeErrorCard({
  title = "레시피를 불러오지 못했어요",
  message,
  onRetry,
}: {
  title?: string;
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
          <p className="text-body-lg text-on-surface">{title}</p>
          <p className="text-body-md text-on-surface-variant">{message}</p>
        </div>
      </div>
      <Button variant="secondary" onClick={onRetry} className="w-full">
        다시 시도하기
      </Button>
    </Card>
  );
}

/**
 * 추천이 하나도 없는 경우. 원인이 둘(재고가 비었다 / 재고는 있는데 맞는
 * 레시피가 아직 없다)이고 사용자가 할 일도 다르므로, 재고를 보고 갈라서
 * 말한다. 어느 쪽이든 빈 카드가 아니라 다음 행동이 보여야 한다.
 */
export function RecipeEmptyState() {
  const { data } = useInventory();
  const hasInventory = (data?.items.length ?? 0) > 0;

  if (hasInventory) {
    return (
      <Card className="flex flex-col items-center gap-4 p-6 text-center">
        <span className="text-6xl" aria-hidden>
          🍳
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-headline-md text-on-surface">
            아직 맞는 레시피를 못 찾았어요
          </p>
          <p className="text-body-md text-on-surface-variant">
            지금 있는 재료로 만들 수 있는 요리를 계속 찾고 있어요. 장을 한 번 더
            보시면 추천이 금방 늘어나요.
          </p>
        </div>
        <Link href="/inventory" className="w-full">
          <Button variant="secondary" className="w-full">
            재고 보러 가기
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center">
      <span className="text-6xl" aria-hidden>
        🧺
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-headline-md text-on-surface">
          재료가 모이면 추천해드릴게요
        </p>
        <p className="text-body-md text-on-surface-variant">
          메일함을 연결하면 주문한 식재료가 자동으로 쌓이고, 그 재료로 만들 수
          있는 요리를 매칭률 순으로 골라드려요.
        </p>
      </div>
      <Link href="/settings/mail-connections" className="w-full">
        <Button className="w-full">메일함 연결하기</Button>
      </Link>
    </Card>
  );
}
