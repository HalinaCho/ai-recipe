"use client";

import type { MealPlanSlot } from "@/types/api";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { MatchMeter } from "@/components/recipes/MatchMeter";
import { formatCalories, formatMissingSummary } from "@/components/recipes/format";
import { categoryLabel } from "@/lib/recipes/meal-suitability";
import { formatLowMatchNote, formatMealType } from "./format";

export interface MealSlotCardProps {
  slot: MealPlanSlot;
  onSwap: () => void;
}

const SOURCE_LABEL: Record<MealPlanSlot["source"], string | null> = {
  auto: null,
  swapped: "바꾼 끼니",
  manual: "직접 고른 끼니",
};

/**
 * 식단표의 한 칸 (FR-12-02 진입점).
 *
 * 카드 전체가 교체 버튼이다. 안에 또 버튼(장보기 CTA 등)을 넣으면 버튼 안의
 * 버튼이 되어 눌리는 곳이 애매해지므로, 카드 안에는 누를 수 없는 표시만 둔다.
 * 장보기 CTA는 주 단위로 아래에 한 번만 놓는다 (FR-13-05).
 */
export function MealSlotCard({ slot, onSwap }: MealSlotCardProps) {
  const { recipe } = slot;
  const missingSummary = formatMissingSummary(recipe.match);
  const lowMatchNote = formatLowMatchNote(recipe.match.matchRate);
  const calories = formatCalories(recipe.calories);
  const sourceLabel = SOURCE_LABEL[slot.source];
  const iconName =
    recipe.match.usesExpiringIngredients[0] ??
    recipe.match.ownedMainIngredients[0] ??
    recipe.name;

  return (
    <button
      type="button"
      onClick={onSwap}
      aria-label={`${formatMealType(slot.mealType)} ${recipe.name} 바꾸기`}
      className="flex w-full flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 text-left shadow-tinted transition-all active:scale-[0.98] active:translate-y-0.5"
    >
      <div className="flex items-start gap-3">
        <IngredientIcon
          normalizedName={iconName}
          size="md"
          className="shrink-0 bg-surface-container-low"
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-secondary-container px-2 py-0.5 text-label-sm text-on-secondary-container">
              {formatMealType(slot.mealType)}
            </span>
            {sourceLabel && (
              <span className="rounded-full bg-primary-container px-2 py-0.5 text-label-sm text-on-primary-container">
                {sourceLabel}
              </span>
            )}
          </span>
          <span className="text-body-lg text-on-surface">{recipe.name}</span>
          <span className="text-label-md text-on-surface-variant">
            {[categoryLabel(recipe.category), calories ?? "영양정보 없음"]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>

        <span
          className="material-symbols-outlined shrink-0 text-on-surface-variant"
          aria-hidden
        >
          swap_horiz
        </span>
      </div>

      <MatchMeter match={recipe.match} />

      {missingSummary ? (
        <span className="flex flex-col gap-1.5">
          <span className="flex items-start gap-1.5 text-label-md text-on-error-container">
            <span
              className="material-symbols-outlined text-[18px] leading-5"
              aria-hidden
            >
              shopping_basket
            </span>
            <span>부족한 재료 · {missingSummary}</span>
          </span>
          {/* FR-13-05: 이 칸이 장보기로 이어질 후보라는 표시. 실제 링크는 Phase 4. */}
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-error-container px-2.5 py-1 text-label-sm text-on-error-container">
            장보기 후보 {recipe.match.missingMainIngredients.length}개
          </span>
          {/* FR-13-07: 제철이 아닌 것을 사러 보내면 비싸고 맛도 덜하다.
              배치는 이미 감점됐지만, 왜 굳이 이게 남았는지는 말해줘야 한다. */}
          {slot.outOfSeasonIngredients.length > 0 && (
            <span className="flex items-start gap-1.5 text-label-md text-on-surface-variant">
              <span
                className="material-symbols-outlined text-[18px] leading-5"
                aria-hidden
              >
                calendar_month
              </span>
              {/* 조사(은/는)를 붙이면 받침에 따라 갈라져야 해서, 재료 이름을
                  문장에 끼우지 않고 뒤에 붙이는 형태로 쓴다. */}
              <span>
                지금 제철이 아니에요 · {slot.outOfSeasonIngredients.join(", ")}
              </span>
            </span>
          )}
        </span>
      ) : (
        <span className="flex items-start gap-1.5 text-label-md text-on-tertiary-container">
          <span
            className="material-symbols-outlined text-[18px] leading-5"
            aria-hidden
          >
            check_circle
          </span>
          <span>있는 재료로 바로 만들 수 있어요</span>
        </span>
      )}

      {lowMatchNote && (
        <span className="rounded-xl bg-surface-container-low px-3 py-2 text-label-md text-on-surface-variant">
          {lowMatchNote}
        </span>
      )}
    </button>
  );
}
