"use client";

import { PreviewBadge } from "@/components/ui/PreviewBadge";
import { useRecipes } from "@/lib/hooks/use-recipes";
import { RecipeCard } from "./RecipeCard";
import {
  RecipeEmptyState,
  RecipeErrorCard,
  RecipeListSkeleton,
} from "./RecipeStates";

/**
 * FR-09-02: 온디맨드 전체 레시피 목록. 서버가 매칭 점수 내림차순으로 주므로
 * 여기서 다시 정렬하지 않는다 — 첫 장이 곧 "지금 가장 만들 만한 것"이다.
 */
export function RecipeList() {
  const { data, isPending, isError, error, refetch } = useRecipes();
  const recipes = data?.recipes ?? [];

  return (
    <div className="flex flex-col gap-3">
      <PreviewBadge />

      {isPending && <RecipeListSkeleton />}

      {isError && (
        <RecipeErrorCard
          message={error instanceof Error ? error.message : "알 수 없는 오류예요."}
          onRetry={() => void refetch()}
        />
      )}

      {!isPending && !isError && recipes.length === 0 && <RecipeEmptyState />}

      {recipes.length > 0 && (
        <>
          <p className="px-1 text-label-md text-on-surface-variant">
            지금 있는 재료로 만들기 좋은 순서예요. 오래 둔 재료를 먼저 쓰는
            요리를 위로 올렸어요.
          </p>
          <ul className="flex flex-col gap-3">
            {recipes.map((recipe, index) => (
              <li key={recipe.id}>
                <RecipeCard recipe={recipe} featured={index === 0} />
              </li>
            ))}
          </ul>
          <p className="px-1 pt-1 text-label-md text-on-surface-variant">
            모두 {recipes.length}개의 레시피를 찾았어요.
          </p>
        </>
      )}
    </div>
  );
}
