"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** 재고·레시피 화면과 같은 골격의 스켈레톤 — 요일 헤더 + 끼니 카드 한두 장. */
export function MealPlanSkeleton({ days = 4 }: { days?: number }) {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      {Array.from({ length: days }).map((_, dayIndex) => (
        <div key={dayIndex} className="flex flex-col gap-2">
          <span className="h-4 w-28 animate-pulse rounded-full bg-surface-container" />
          {Array.from({ length: dayIndex % 3 === 2 ? 2 : 1 }).map((_, mealIndex) => (
            <div
              key={mealIndex}
              className="flex animate-pulse flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-tinted"
            >
              <div className="flex items-center gap-3">
                <span className="h-12 w-12 shrink-0 rounded-full bg-surface-container" />
                <span className="flex flex-1 flex-col gap-2">
                  <span className="h-4 w-32 rounded-full bg-surface-container" />
                  <span className="h-3 w-20 rounded-full bg-surface-container-low" />
                </span>
              </div>
              <span className="h-3 w-full rounded-full bg-surface-container" />
            </div>
          ))}
        </div>
      ))}
      <span className="sr-only">식단표를 짜는 중이에요</span>
    </div>
  );
}

export function MealPlanErrorCard({
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
            식단표를 불러오지 못했어요
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

/**
 * 칸이 하나도 없는 주. FR-13-03 때문에 정상적으로는 나올 수 없는 상태지만,
 * 서버가 아직 못 짰거나 빈 응답을 준 경우까지 빈 화면으로 두지는 않는다.
 */
export function MealPlanEmptyState({
  onRegenerate,
  isPending,
}: {
  onRegenerate: () => void;
  isPending: boolean;
}) {
  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center">
      <span className="text-6xl" aria-hidden>
        🗓️
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-headline-md text-on-surface">
          이번 주 식단표가 아직 없어요
        </p>
        <p className="text-body-md text-on-surface-variant">
          지금 있는 재료로 한 주치를 짜드릴게요. 평일은 저녁, 주말과 공휴일은
          점심까지 챙겨요.
        </p>
      </div>
      <Button className="w-full" onClick={onRegenerate} disabled={isPending}>
        {isPending ? "식단표 짜는 중..." : "식단표 짜기"}
      </Button>
    </Card>
  );
}
