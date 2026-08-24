"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  RecipeBookmarkResponse,
  RecipeBookmarksResponse,
} from "@/types/api";
import { apiFetch } from "./api-client";
import {
  isFixturePreview,
  loadBookmarkedRecipesFixture,
  toggleRecipeBookmarkFixture,
} from "./fixture-preview";
import { recipeDetailQueryKey } from "./use-recipes";

export const RECIPE_BOOKMARKS_QUERY_KEY = ["recipes", "bookmarks"] as const;

/** GET /api/recipes/bookmarks — 마이페이지의 "레시피 북마크" 목록. */
export function useBookmarkedRecipes() {
  return useQuery<RecipeBookmarksResponse>({
    queryKey: RECIPE_BOOKMARKS_QUERY_KEY,
    queryFn: () =>
      isFixturePreview()
        ? loadBookmarkedRecipesFixture()
        : apiFetch<RecipeBookmarksResponse>("/api/recipes/bookmarks"),
    retry: 1,
  });
}

/**
 * POST/DELETE /api/recipes/[id]/bookmark — 상세 화면의 북마크 토글.
 * 상세 쿼리 안의 `bookmarked` 플래그와 목록을 둘 다 무효화한다 — 상세만
 * 갱신하면 마이페이지의 북마크 목록이 낡은 채로 남는다.
 */
export function useToggleRecipeBookmark(recipeId: string) {
  const queryClient = useQueryClient();

  return useMutation<RecipeBookmarkResponse, Error, boolean>({
    mutationFn: (nextBookmarked) =>
      isFixturePreview()
        ? toggleRecipeBookmarkFixture(recipeId, nextBookmarked)
        : apiFetch<RecipeBookmarkResponse>(`/api/recipes/${recipeId}/bookmark`, {
            method: nextBookmarked ? "POST" : "DELETE",
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipeDetailQueryKey(recipeId) });
      queryClient.invalidateQueries({ queryKey: RECIPE_BOOKMARKS_QUERY_KEY });
    },
  });
}
