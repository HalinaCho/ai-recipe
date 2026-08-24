"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CookChecklistResponse,
  CookRecipeRequest,
  CookRecipeResponse,
  RecipeDetailResponse,
  RecipeListResponse,
  TodayRecipesResponse,
} from "@/types/api";
import { apiFetch } from "./api-client";
import {
  isFixturePreview,
  loadCookChecklistFixture,
  loadRecipeDetailFixture,
  loadRecipeListFixture,
  loadTodayRecipesFixture,
} from "./fixture-preview";
import { invalidateInventoryDerived } from "./use-inventory";

export const RECIPES_QUERY_KEY = ["recipes"] as const;
export const TODAY_RECIPES_QUERY_KEY = ["recipes", "today"] as const;

export const recipeDetailQueryKey = (id: string) =>
  ["recipes", "detail", id] as const;
export const cookChecklistQueryKey = (id: string) =>
  ["recipes", "cook-checklist", id] as const;

/**
 * GET /api/recipes — 매칭 점수 내림차순으로 서버가 이미 정렬해서 준다
 * (FR-09-02). 화면은 순서를 다시 만지지 않고 그대로 그린다.
 *
 * search는 재료명·레시피명 자유 검색어다. 있으면 후보 50개 제한과 무관하게
 * 서버가 전체 레시피에서 찾는다 — "지금 있는 재료로 뭘 만들 수 있나"의
 * 상위 몇 개만 클라이언트에서 걸러내면 원하는 레시피가 애초에 안 왔을 수
 * 있어서다.
 */
export function useRecipes(categories: readonly string[] = [], search = "") {
  // 정렬해서 키를 만든다 — [반찬,국]과 [국,반찬]은 같은 요청인데 키가 다르면
  // 같은 목록을 두 번 받아 온다.
  const categoryKey = [...categories].sort().join(",");
  const searchKey = search.trim();

  return useQuery<RecipeListResponse>({
    // ["recipes"]가 접두사로 남아야 재고 변경 시 함께 무효화된다.
    queryKey: [...RECIPES_QUERY_KEY, "list", categoryKey, searchKey],
    queryFn: () => {
      if (isFixturePreview()) {
        return loadRecipeListFixture(categories, searchKey);
      }
      const params = new URLSearchParams();
      if (categoryKey) params.set("categories", categoryKey);
      if (searchKey) params.set("q", searchKey);
      const qs = params.toString();
      return apiFetch<RecipeListResponse>(
        qs ? `/api/recipes?${qs}` : "/api/recipes",
      );
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * GET /api/recipes/today — 하루 단위로 고정되는 오늘의 추천 (FR-09-01).
 * 하루 안에서는 바뀌지 않으므로 staleTime을 길게 잡는다.
 */
export function useTodayRecipes() {
  return useQuery<TodayRecipesResponse>({
    queryKey: TODAY_RECIPES_QUERY_KEY,
    queryFn: () =>
      isFixturePreview()
        ? loadTodayRecipesFixture()
        : apiFetch<TodayRecipesResponse>("/api/recipes/today"),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** GET /api/recipes/[id] */
export function useRecipeDetail(id: string) {
  return useQuery<RecipeDetailResponse>({
    queryKey: recipeDetailQueryKey(id),
    queryFn: () =>
      isFixturePreview()
        ? loadRecipeDetailFixture(id)
        : apiFetch<RecipeDetailResponse>(`/api/recipes/${id}`),
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * GET /api/recipes/[id]/cook — 요리함 체크리스트 (FR-05-01).
 * 모달을 열 때만 부르고, 재고가 바뀌면 후보도 바뀌므로 캐시를 오래 두지 않는다.
 */
export function useCookChecklist(id: string, enabled: boolean) {
  return useQuery<CookChecklistResponse>({
    queryKey: cookChecklistQueryKey(id),
    queryFn: () =>
      isFixturePreview()
        ? loadCookChecklistFixture(id)
        : apiFetch<CookChecklistResponse>(`/api/recipes/${id}/cook`),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });
}

/**
 * POST /api/recipes/[id]/cook — 사용자가 체크한 재료만 소진 처리한다.
 *
 * 재고가 실제로 줄어드는 유일한 지점이므로 성공 후 재고 쿼리를 무효화해서
 * 홈·재고 화면이 바로 바뀐 걸 보여주게 한다. 매칭률도 재고 기준이라
 * 레시피 목록/상세도 함께 무효화한다.
 */
export function useCookRecipe(id: string) {
  const queryClient = useQueryClient();

  return useMutation<CookRecipeResponse, Error, string[]>({
    mutationFn: async (consumedInventoryItemIds) => {
      if (isFixturePreview()) {
        // 미리보기에는 백엔드가 없다 — 실제로 지우지 않고 결과만 흉내 낸다.
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { consumedCount: consumedInventoryItemIds.length };
      }
      return apiFetch<CookRecipeResponse>(`/api/recipes/${id}/cook`, {
        method: "POST",
        body: JSON.stringify({
          consumedInventoryItemIds,
        } satisfies CookRecipeRequest),
      });
    },
    onSuccess: () => {
      if (isFixturePreview()) return;
      invalidateInventoryDerived(queryClient);
    },
  });
}
