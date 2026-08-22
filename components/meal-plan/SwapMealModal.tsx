"use client";

import { useMemo, useState } from "react";
import type { MealPlanDish, RecipeListItem } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import {
  formatMatchRate,
  formatMissingSummary,
  formatOwnedSummary,
  matchLevel,
} from "@/components/recipes/format";
import { useMealPlanCandidates } from "@/lib/hooks/use-meal-plan";
import { useRecipes } from "@/lib/hooks/use-recipes";
import { cn } from "@/lib/utils";
import { DISH_ROLE_LABEL } from "@/lib/meal-plan/composition";

/** 검색 결과를 다 그리면 스크롤이 끝없이 길어진다 — 위에서부터 이만큼만. */
const SEARCH_RESULT_LIMIT = 20;

export interface SwapMealModalProps {
  /** null이면 닫힌 상태. */
  dish: MealPlanDish | null;
  onClose: () => void;
  onSelect: (recipe: RecipeListItem, source: "swapped" | "manual") => void;
  isPending: boolean;
  errorMessage?: string | null;
}

type Tab = "candidates" | "search";

/**
 * 끼니 교체 (FR-12-02 스왑 / FR-12-03 자유 편집).
 *
 * 두 경로를 한 시트에 둔다. 대부분은 추천 후보에서 고르지만, "오늘은 그냥
 * 카레가 먹고 싶다"는 사람에게 후보만 들이밀면 앱이 고집을 부리는 것처럼 느껴진다.
 * 그래서 직접 찾아 고르는 길을 같은 깊이에 나란히 놓는다.
 */
export function SwapMealModal({
  dish,
  onClose,
  onSelect,
  isPending,
  errorMessage,
}: SwapMealModalProps) {
  const open = dish !== null;
  const [tab, setTab] = useState<Tab>("candidates");
  const [query, setQuery] = useState("");

  const candidates = useMealPlanCandidates(dish?.id ?? "", open);
  // 직접 고르기 탭을 열었을 때만 전체 목록을 부른다 (레시피 탭과 같은 캐시를 쓴다).
  const recipes = useRecipes();

  const currentRecipeId = dish?.recipe?.id ?? "";

  const searchResults = useMemo(() => {
    const all = recipes.data?.recipes ?? [];
    const keyword = query.trim();
    const filtered = keyword
      ? all.filter((recipe) => recipe.name.includes(keyword))
      : all;
    return filtered
      .filter((recipe) => recipe.id !== currentRecipeId)
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [recipes.data, query, currentRecipeId]);

  if (!dish) return null;

  const candidateList = candidates.data?.candidates ?? [];

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex max-h-[80vh] flex-col gap-4">
        <span
          aria-hidden
          className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-outline-variant"
        />

        <div className="flex shrink-0 flex-col gap-1">
          <p className="text-label-md text-primary">
            {DISH_ROLE_LABEL[dish.role]}
          </p>
          <h2 className="text-headline-md text-on-surface">
            {dish.recipe?.name ?? "이 자리"} 대신 뭐 드실래요?
          </h2>
          <p className="text-body-md text-on-surface-variant">
            고르면 바로 바뀌어요. 이번 주에 이미 넣은 요리는 후보에서 빼뒀어요.
          </p>
        </div>

        <div className="flex shrink-0 gap-2" role="tablist">
          <TabButton
            active={tab === "candidates"}
            onClick={() => setTab("candidates")}
          >
            추천 후보
          </TabButton>
          <TabButton active={tab === "search"} onClick={() => setTab("search")}>
            직접 고르기
          </TabButton>
        </div>

        {tab === "search" && (
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="먹고 싶은 요리 이름"
            aria-label="레시피 검색"
            className="shrink-0"
          />
        )}

        <div className="-mx-1 flex flex-1 flex-col gap-2 overflow-y-auto px-1">
          {tab === "candidates" ? (
            <>
              {candidates.isPending && <RowSkeleton />}
              {candidates.isError && (
                <RetryBlock
                  message={
                    candidates.error instanceof Error
                      ? candidates.error.message
                      : "후보를 불러오지 못했어요."
                  }
                  onRetry={() => void candidates.refetch()}
                />
              )}
              {!candidates.isPending &&
                !candidates.isError &&
                candidateList.length === 0 && (
                  <p className="rounded-xl bg-surface-container-low px-3 py-3 text-body-md text-on-surface-variant">
                    바꿔드릴 만한 후보가 없어요. 직접 고르기에서 찾아보세요.
                  </p>
                )}
              {candidateList.map((recipe) => (
                <RecipeChoiceRow
                  key={recipe.id}
                  recipe={recipe}
                  disabled={isPending}
                  onClick={() => onSelect(recipe, "swapped")}
                />
              ))}
            </>
          ) : (
            <>
              {recipes.isPending && <RowSkeleton />}
              {recipes.isError && (
                <RetryBlock
                  message={
                    recipes.error instanceof Error
                      ? recipes.error.message
                      : "레시피 목록을 불러오지 못했어요."
                  }
                  onRetry={() => void recipes.refetch()}
                />
              )}
              {!recipes.isPending &&
                !recipes.isError &&
                searchResults.length === 0 && (
                  <p className="rounded-xl bg-surface-container-low px-3 py-3 text-body-md text-on-surface-variant">
                    {query.trim()
                      ? `'${query.trim()}'로 찾은 요리가 없어요. 다른 이름으로 해볼까요?`
                      : "고를 수 있는 레시피가 아직 없어요."}
                  </p>
                )}
              {searchResults.map((recipe) => (
                <RecipeChoiceRow
                  key={recipe.id}
                  recipe={recipe}
                  disabled={isPending}
                  onClick={() => onSelect(recipe, "manual")}
                />
              ))}
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2">
          {errorMessage && (
            <p className="rounded-xl bg-error-container px-3 py-2.5 text-label-md text-on-error-container">
              바꾸지 못했어요. {errorMessage}
            </p>
          )}
          {isPending && (
            <p
              className="rounded-xl bg-primary-container px-3 py-2.5 text-label-md text-on-primary-container"
              aria-live="polite"
            >
              끼니를 바꾸는 중이에요...
            </p>
          )}
          <Button
            variant="ghost"
            className="w-full"
            onClick={onClose}
            disabled={isPending}
          >
            그냥 둘래요
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "min-h-12 flex-1 rounded-xl text-label-md transition-all active:scale-[0.97]",
        active
          ? "bg-primary-container text-on-primary-container"
          : "bg-surface-container-low text-on-surface-variant",
      )}
    >
      {children}
    </button>
  );
}

const LEVEL_CLASS = {
  full: "bg-tertiary-container text-on-tertiary-container",
  most: "bg-primary-container text-on-primary-container",
  some: "bg-surface-container-high text-on-surface-variant",
} as const;

function RecipeChoiceRow({
  recipe,
  disabled,
  onClick,
}: {
  recipe: RecipeListItem;
  disabled: boolean;
  onClick: () => void;
}) {
  const missing = formatMissingSummary(recipe.match);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full min-h-12 items-center gap-3 rounded-xl border-2 border-outline-variant bg-surface-container-lowest p-3 text-left transition-all active:scale-[0.98] active:translate-y-0.5 disabled:opacity-50"
    >
      <IngredientIcon
        normalizedName={
          recipe.match.ownedMainIngredients[0] ?? recipe.name
        }
        size="sm"
        className="shrink-0 bg-surface-container-low"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-lg text-on-surface">
          {recipe.name}
        </span>
        <span className="truncate text-label-md text-on-surface-variant">
          {formatOwnedSummary(recipe.match)}
        </span>
        {missing && (
          <span className="truncate text-label-sm text-on-error-container">
            {missing}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-label-sm",
          LEVEL_CLASS[matchLevel(recipe.match.matchRate)],
        )}
      >
        {formatMatchRate(recipe.match.matchRate)}
      </span>
    </button>
  );
}

function RowSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-xl bg-surface-container-low"
        />
      ))}
    </div>
  );
}

function RetryBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-md text-on-surface-variant">{message}</p>
      <Button variant="secondary" className="w-full" onClick={onRetry}>
        다시 시도하기
      </Button>
    </div>
  );
}
