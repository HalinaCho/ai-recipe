import Link from "next/link";
import type { RecipeListItem } from "@/types/api";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { cn } from "@/lib/utils";
import {
  formatCalories,
  formatExpiringReason,
  formatMissingSummary,
  formatOwnedSummary,
} from "./format";
import { MatchMeter } from "./MatchMeter";
import { MealKitInlineCta } from "./MealKitCta";

export interface RecipeCardProps {
  recipe: RecipeListItem;
  /** 목록 맨 위 한 장 — 왜 1등인지 한 번 더 설명해준다. */
  featured?: boolean;
  className?: string;
}

/**
 * FR-09-02 목록 카드. 이름·매칭률만으로는 "왜 이게 떴는지" 알 수 없어서,
 * 이 레시피가 먼저 써주는 소진임박 재료와 부족한 재료를 카드 안에서 다 보여준다
 * (FR-08-02). 상세를 열지 않아도 판단이 끝나야 한다.
 */
export function RecipeCard({ recipe, featured, className }: RecipeCardProps) {
  const { match } = recipe;
  const expiringReason = formatExpiringReason(match);
  const missingSummary = formatMissingSummary(match);
  const calories = formatCalories(recipe.calories);
  const iconName =
    match.usesExpiringIngredients[0] ??
    match.ownedMainIngredients[0] ??
    recipe.name;

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-tinted transition-all active:scale-[0.98] active:translate-y-0.5",
        featured && "bg-primary-container/40",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <IngredientIcon
          normalizedName={iconName}
          size="md"
          className="shrink-0 bg-surface-container-low"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {featured && (
            <span className="text-label-sm text-primary">오늘의 1순위</span>
          )}
          <h3 className="text-body-lg text-on-surface">{recipe.name}</h3>
          <p className="text-label-md text-on-surface-variant">
            {formatOwnedSummary(match)}
            {calories && ` · ${calories}`}
          </p>
        </div>
        <span
          className="material-symbols-outlined shrink-0 text-on-surface-variant"
          aria-hidden
        >
          chevron_right
        </span>
      </div>

      <MatchMeter match={match} />

      {expiringReason && (
        <p className="flex items-start gap-1.5 text-label-md text-on-tertiary-container">
          <span
            className="material-symbols-outlined text-[18px] leading-5"
            aria-hidden
          >
            schedule
          </span>
          <span>{expiringReason}</span>
        </p>
      )}

      {missingSummary ? (
        <p className="flex items-start gap-1.5 text-label-md text-on-error-container">
          <span
            className="material-symbols-outlined text-[18px] leading-5"
            aria-hidden
          >
            shopping_basket
          </span>
          <span>부족한 재료 · {missingSummary}</span>
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-label-md text-on-tertiary-container">
          <span
            className="material-symbols-outlined text-[18px] leading-5"
            aria-hidden
          >
            check_circle
          </span>
          <span>지금 바로 만들 수 있어요</span>
        </p>
      )}

      {recipe.showMealKitCta && <MealKitInlineCta />}
    </Link>
  );
}
