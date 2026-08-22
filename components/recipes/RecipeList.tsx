"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PreviewBadge } from "@/components/ui/PreviewBadge";
import { useRecipes } from "@/lib/hooks/use-recipes";
import { RecipeCard } from "./RecipeCard";
import { RecipeCategoryFilter } from "./RecipeCategoryFilter";
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
  const [categories, setCategories] = useState<string[]>([]);
  const { data, isPending, isError, error, refetch } = useRecipes(categories);
  const recipes = data?.recipes ?? [];
  const filtering = categories.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <PreviewBadge />

      <RecipeCategoryFilter selected={categories} onChange={setCategories} />

      {isPending && <RecipeListSkeleton />}

      {isError && (
        <RecipeErrorCard
          message={error instanceof Error ? error.message : "알 수 없는 오류예요."}
          onRetry={() => void refetch()}
        />
      )}

      {/* 필터를 걸어서 빈 경우와 재고가 없어서 빈 경우는 원인이 달라
          안내도 달라야 한다. 재고를 채우라고 하면 엉뚱한 조언이 된다. */}
      {!isPending && !isError && recipes.length === 0 && filtering && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body-lg text-on-surface">
            고른 종류에는 맞는 레시피가 없어요.
          </p>
          <Button variant="secondary" onClick={() => setCategories([])}>
            전체 보기
          </Button>
        </Card>
      )}

      {!isPending && !isError && recipes.length === 0 && !filtering && (
        <RecipeEmptyState />
      )}

      {recipes.length > 0 && (
        <>
          <p className="px-1 text-label-md text-on-surface-variant">
            {filtering
              ? `${categories.join("·")} 중에서 지금 있는 재료로 만들기 좋은 순서예요.`
              : "지금 있는 재료로 만들기 좋은 순서예요. 오래 둔 재료를 먼저 쓰는 요리를 위로 올렸어요."}
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
