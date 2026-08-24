"use client";

import { Card } from "@/components/ui/Card";
import { PreviewBadge } from "@/components/ui/PreviewBadge";
import { useBookmarkedRecipes } from "@/lib/hooks/use-recipe-bookmarks";
import { RecipeCard } from "./RecipeCard";
import { RecipeErrorCard, RecipeListSkeleton } from "./RecipeStates";

/** 마이페이지 → 레시피 북마크. 담은 순서(최근 먼저)로 보여준다. */
export function BookmarkedRecipeList() {
  const { data, isPending, isError, error, refetch } = useBookmarkedRecipes();
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

      {!isPending && !isError && recipes.length === 0 && (
        <Card className="flex flex-col items-center gap-4 p-6 text-center">
          <span className="text-6xl" aria-hidden>
            🔖
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-headline-md text-on-surface">
              아직 담아둔 레시피가 없어요
            </p>
            <p className="text-body-md text-on-surface-variant">
              레시피 상세 화면에서 이름 옆 북마크 아이콘을 누르면 여기 모여요.
            </p>
          </div>
        </Card>
      )}

      {recipes.length > 0 && (
        <ul className="flex flex-col gap-3">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <RecipeCard recipe={recipe} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
