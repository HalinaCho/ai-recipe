"use client";

import type { MealPlanDish, MealPlanSlot } from "@/types/api";
import { RecipeImage } from "@/components/recipes/RecipeImage";
import { MatchMeter } from "@/components/recipes/MatchMeter";
import { formatCalories, formatMissingSummary } from "@/components/recipes/format";
import { DISH_ROLE_LABEL } from "@/lib/meal-plan/composition";
import { formatMealType } from "./format";

export interface MealSlotCardProps {
  slot: MealPlanSlot;
  onSwapDish: (slot: MealPlanSlot, dish: MealPlanDish) => void;
}

const SOURCE_LABEL: Record<MealPlanDish["source"], string | null> = {
  auto: null,
  swapped: "바꾼 요리",
  manual: "직접 고른 요리",
};

/**
 * 식단표의 한 끼니 (FR-13-08). 상차림이라 요리가 여럿일 수 있다.
 *
 * 끼니 전체가 아니라 **요리 하나씩** 누르게 한 이유: 국만 바꾸고 반찬은 두고
 * 싶은 게 자연스럽다. 끼니 단위로 교체하면 마음에 드는 반찬까지 같이 날아간다.
 */
export function MealSlotCard({ slot, onSwapDish }: MealSlotCardProps) {
  const totalCalories = slot.dishes.reduce(
    (sum, dish) => sum + (dish.recipe.calories ?? 0),
    0,
  );
  const missingCount = new Set(
    slot.dishes.flatMap((dish) => dish.missingMainIngredients),
  ).size;

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-surface-container-lowest p-3 shadow-tinted">
      <header className="flex items-center gap-2 px-1">
        <span className="rounded-full bg-secondary-container px-2 py-0.5 text-label-sm text-on-secondary-container">
          {formatMealType(slot.mealType)}
        </span>
        <span className="flex-1 text-label-md text-on-surface-variant">
          {slot.dishes.length}가지
          {totalCalories > 0 && ` · ${formatCalories(totalCalories)}`}
        </span>
        {missingCount > 0 && (
          <span className="shrink-0 rounded-full bg-error-container px-2 py-0.5 text-label-sm text-on-error-container">
            살 것 {missingCount}
          </span>
        )}
      </header>

      <ul className="flex flex-col gap-2">
        {slot.dishes.map((dish) => (
          <li key={dish.id}>
            <DishRow dish={dish} onSwap={() => onSwapDish(slot, dish)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DishRow({
  dish,
  onSwap,
}: {
  dish: MealPlanDish;
  onSwap: () => void;
}) {
  const { recipe } = dish;
  const missingSummary = formatMissingSummary(recipe.match);
  const sourceLabel = SOURCE_LABEL[dish.source];
  const iconName =
    recipe.match.usesExpiringIngredients[0] ??
    recipe.match.ownedMainIngredients[0] ??
    recipe.name;

  return (
    <button
      type="button"
      onClick={onSwap}
      aria-label={`${recipe.name} 바꾸기`}
      className="flex w-full flex-col gap-2 rounded-lg bg-surface-container-low p-2.5 text-left transition-all active:scale-[0.98]"
    >
      <div className="flex items-start gap-2.5">
        <RecipeImage
          src={recipe.imageUrl}
          alt={recipe.name}
          fallbackName={iconName}
          className="h-12 w-12 shrink-0 rounded-lg bg-surface-container"
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-surface-container px-2 py-0.5 text-label-sm text-on-surface-variant">
              {DISH_ROLE_LABEL[dish.role]}
            </span>
            {sourceLabel && (
              <span className="rounded-full bg-primary-container px-2 py-0.5 text-label-sm text-on-primary-container">
                {sourceLabel}
              </span>
            )}
          </span>
          <span className="truncate text-body-lg text-on-surface">
            {recipe.name}
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
        <span className="flex flex-col gap-1">
          <span className="text-label-md text-on-error-container">
            부족 · {missingSummary}
          </span>
          {/* FR-13-07: 제철이 아닌 것을 사러 보내면 비싸고 맛도 덜하다. */}
          {dish.outOfSeasonIngredients.length > 0 && (
            <span className="text-label-md text-on-surface-variant">
              지금 제철이 아니에요 · {dish.outOfSeasonIngredients.join(", ")}
            </span>
          )}
        </span>
      ) : (
        <span className="text-label-md text-on-tertiary-container">
          있는 재료로 바로 만들 수 있어요
        </span>
      )}
    </button>
  );
}
