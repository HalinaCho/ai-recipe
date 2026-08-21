"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  MealPlanDish,
  MealPlanSlot,
  RecipeListItem,
} from "@/types/api";
import { Button } from "@/components/ui/Button";
import { PreviewBadge } from "@/components/ui/PreviewBadge";
import {
  useMealPlan,
  useRegenerateMealPlan,
  useUpdateMealPlanEntry,
} from "@/lib/hooks/use-meal-plan";
import { cn } from "@/lib/utils";
import { MealPlanDayCard } from "./MealPlanDayCard";
import {
  MealPlanEmptyState,
  MealPlanErrorCard,
  MealPlanSkeleton,
} from "./MealPlanStates";
import { RegeneratePlanModal } from "./RegeneratePlanModal";
import { ShoppingCandidatesCard } from "./ShoppingCandidatesCard";
import { SwapMealModal } from "./SwapMealModal";
import { WeeklyNutritionCard } from "./WeeklyNutritionCard";
import { WeekNavigator } from "./WeekNavigator";
import { addDays, seoulToday, weekStartOf } from "./week";

/**
 * 주간 식단표 (PRD §4.1 식단표 탭, FR-11 ~ FR-14).
 *
 * 오늘 날짜는 마운트 후에 정한다. 서버 렌더 시점의 날짜로 주를 계산하면
 * 자정 전후나 시차가 있는 환경에서 서버와 브라우저가 다른 주를 그려 하이드레이션이
 * 어긋난다. 그래서 첫 페인트는 스켈레톤이고, 주는 브라우저에서 정해진다.
 */
export function MealPlanView() {
  const [today, setToday] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [activeDish, setActiveDish] = useState<MealPlanDish | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const now = seoulToday();
    setToday(now);
    setWeekStart(weekStartOf(now));
  }, []);

  const plan = useMealPlan(weekStart);
  const update = useUpdateMealPlanEntry(weekStart ?? "");
  const regenerate = useRegenerateMealPlan(weekStart ?? "");

  const slots = useMemo(() => plan.data?.slots ?? [], [plan.data]);

  /** 서버가 준 순서를 지키면서 날짜별로 묶는다 — 정렬을 화면에서 다시 하지 않는다. */
  const days = useMemo(() => {
    const grouped = new Map<string, MealPlanSlot[]>();
    for (const slot of slots) {
      const list = grouped.get(slot.date);
      if (list) list.push(slot);
      else grouped.set(slot.date, [slot]);
    }
    return [...grouped.entries()];
  }, [slots]);

  // 손댄 **요리** 수. 재생성 경고 문구가 "3개 끼니"가 아니라 "3가지 요리"여야
  // 실제로 무엇이 날아가는지 맞다 (FR-13-08 이후 한 끼니에 요리가 여럿이다).
  const editedCount = slots
    .flatMap((slot) => slot.dishes)
    .filter((dish) => dish.source !== "auto").length;

  const handleSelectRecipe = (
    recipe: RecipeListItem,
    source: "swapped" | "manual",
  ) => {
    if (!activeDish) return;
    update.mutate(
      { entryId: activeDish.id, recipe, source },
      { onSuccess: () => setActiveDish(null) },
    );
  };

  const handleRegenerateClick = () => {
    // 손댄 칸이 없으면 물어볼 것도 없다. 있으면 반드시 확인을 받는다 (FR-12-01).
    if (editedCount > 0) {
      setConfirmOpen(true);
      return;
    }
    regenerate.mutate({ includeEdited: false });
  };

  const handleConfirmRegenerate = (includeEdited: boolean) => {
    regenerate.mutate(
      { includeEdited },
      { onSuccess: () => setConfirmOpen(false) },
    );
  };

  // 아직 주가 안 정해졌거나(마운트 전) 첫 로딩.
  const showSkeleton = weekStart === null || plan.isPending;
  const regenerateError =
    regenerate.error instanceof Error ? regenerate.error.message : null;

  return (
    <div className="flex flex-col gap-5">
      <PreviewBadge />

      {weekStart && today && (
        <WeekNavigator
          weekStart={weekStart}
          today={today}
          onPrev={() => setWeekStart(addDays(weekStart, -7))}
          onNext={() => setWeekStart(addDays(weekStart, 7))}
          onToday={() => setWeekStart(weekStartOf(today))}
        />
      )}

      {/* FR-11-02: 공휴일 조회가 실패해도 식단표 자체는 정상이다. 에러로 막지 않고
          왜 끼니 수가 달라 보일 수 있는지만 조용히 알려준다. */}
      {plan.data?.holidayLookupDegraded && (
        <p className="flex items-start gap-2 rounded-xl bg-secondary-container px-3 py-2.5 text-label-md text-on-secondary-container">
          <span className="material-symbols-outlined text-[18px] leading-5" aria-hidden>
            info
          </span>
          <span>
            공휴일 정보를 못 받아와서 주말만 챙겼어요. 이번 주에 공휴일이 있으면
            점심이 빠져 있을 수 있어요.
          </span>
        </p>
      )}

      {showSkeleton && <MealPlanSkeleton />}

      {!showSkeleton && plan.isError && (
        <MealPlanErrorCard
          message={
            plan.error instanceof Error ? plan.error.message : "알 수 없는 오류예요."
          }
          onRetry={() => void plan.refetch()}
        />
      )}

      {!showSkeleton && !plan.isError && slots.length === 0 && (
        <MealPlanEmptyState
          onRegenerate={() => regenerate.mutate({ includeEdited: true })}
          isPending={regenerate.isPending}
        />
      )}

      {!showSkeleton && slots.length > 0 && (
        <>
          <p className="px-1 text-label-md text-on-surface-variant">
            평일은 저녁, 주말과 공휴일은 점심까지 짰어요. 마음에 안 드는 끼니는
            눌러서 바꿔주세요.
          </p>

          {/* 주를 넘기는 동안에는 이전 주 내용이 남아 있다. 흐리게 해서 아직
              바뀌는 중이라는 걸 보여준다. */}
          <div
            className={cn(
              "flex flex-col gap-5 transition-opacity",
              plan.isPlaceholderData && "opacity-50",
            )}
          >
            {days.map(([date, daySlots]) => (
              <MealPlanDayCard
                key={date}
                date={date}
                slots={daySlots}
                isToday={date === today}
                onSwapDish={(_slot, dish) => {
                  // 지난 번 실패 메시지가 새로 연 시트에 남아 있으면 안 된다.
                  update.reset();
                  setActiveDish(dish);
                }}
              />
            ))}
          </div>

          <ShoppingCandidatesCard slots={slots} />

          {plan.data && (
            <WeeklyNutritionCard
              nutrition={plan.data.nutrition}
              isStale={update.isPending}
            />
          )}

          <div className="flex flex-col gap-2">
            {regenerateError && !confirmOpen && (
              <p className="rounded-xl bg-error-container px-3 py-2.5 text-label-md text-on-error-container">
                다시 짜지 못했어요. {regenerateError}
              </p>
            )}
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleRegenerateClick}
              disabled={regenerate.isPending}
            >
              {regenerate.isPending ? "다시 짜는 중..." : "식단표 다시 짜기"}
            </Button>
          </div>
        </>
      )}

      {activeDish && (
        <SwapMealModal
          key={activeDish.id}
          dish={activeDish}
          onClose={() => setActiveDish(null)}
          onSelect={handleSelectRecipe}
          isPending={update.isPending}
          errorMessage={
            update.error instanceof Error ? update.error.message : null
          }
        />
      )}

      <RegeneratePlanModal
        open={confirmOpen}
        editedCount={editedCount}
        isPending={regenerate.isPending}
        errorMessage={regenerateError}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmRegenerate}
      />
    </div>
  );
}
