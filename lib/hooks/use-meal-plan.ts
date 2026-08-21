"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  MealPlanCandidatesResponse,
  MealPlanResponse,
  RecipeListItem,
  RegenerateMealPlanRequest,
  UpdateMealPlanEntryRequest,
  UpdateMealPlanEntryResponse,
} from "@/types/api";
import { apiFetch } from "./api-client";
import {
  isFixturePreview,
  loadMealPlanCandidatesFixture,
  loadMealPlanFixture,
  regenerateMealPlanFixture,
  updateMealPlanEntryFixture,
} from "./fixture-preview";

export const MEAL_PLAN_QUERY_KEY = ["meal-plan"] as const;
export const MEAL_PLAN_CANDIDATES_KEY = ["meal-plan", "candidates"] as const;

export const mealPlanQueryKey = (weekStart: string) =>
  ["meal-plan", "week", weekStart] as const;

export const mealPlanCandidatesQueryKey = (entryId: string) =>
  ["meal-plan", "candidates", entryId] as const;

/**
 * GET /api/meal-plan?weekStart=… (FR-11 / FR-12-01)
 *
 * weekStart는 화면이 항상 넘긴다. 서버도 생략을 허용하지만, 주 이동 버튼이
 * 있는 화면에서 "이번 주"를 서버가 정하게 두면 앞뒤 주와 캐시 키가 엉킨다.
 * 마운트 전(weekStart === null)에는 아예 요청하지 않는다 — 브라우저 시각으로
 * 계산한 주가 서버 렌더 결과와 달라 하이드레이션이 깨지는 걸 막는다.
 */
export function useMealPlan(weekStart: string | null) {
  return useQuery<MealPlanResponse>({
    queryKey: mealPlanQueryKey(weekStart ?? ""),
    queryFn: () =>
      isFixturePreview()
        ? loadMealPlanFixture(weekStart ?? undefined)
        : apiFetch<MealPlanResponse>(
            `/api/meal-plan?weekStart=${encodeURIComponent(weekStart ?? "")}`,
          ),
    enabled: weekStart !== null,
    // 주를 넘길 때마다 스켈레톤으로 화면이 통째로 깜빡이면 어디를 보고 있었는지
    // 놓친다. 이전 주 내용을 흐리게 남겨두고 그 위에 새 주가 덮이게 한다.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 1,
  });
}

/** GET /api/meal-plan/entries/[id]/candidates — 스왑 후보 (FR-12-02). */
export function useMealPlanCandidates(entryId: string, enabled: boolean) {
  return useQuery<MealPlanCandidatesResponse>({
    queryKey: mealPlanCandidatesQueryKey(entryId),
    queryFn: () =>
      isFixturePreview()
        ? loadMealPlanCandidatesFixture(entryId)
        : apiFetch<MealPlanCandidatesResponse>(
            `/api/meal-plan/entries/${entryId}/candidates`,
          ),
    enabled,
    // 후보는 그 주에 이미 배치된 레시피를 빼고 오므로, 교체 직후엔 항상 낡는다.
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  });
}

export interface UpdateMealPlanEntryVariables {
  entryId: string;
  /**
   * 고른 레시피 객체 그대로. id만 넘기면 낙관적 업데이트 때 카드에 그릴 이름·
   * 매칭률이 없어서 칸이 잠깐 비어 보인다.
   */
  recipe: RecipeListItem;
  /**
   * 후보 목록에서 골랐는지(swapped), 검색으로 골랐는지(manual) — FR-12-03.
   * 실제 서버는 이걸 스스로 정하므로 요청 바디에는 넣지 않고, 낙관적 표시와
   * 픽스처 모드에서만 쓴다.
   */
  source: "swapped" | "manual";
}

/**
 * PATCH /api/meal-plan/entries/[id] — 끼니 교체.
 *
 * 낙관적으로 먼저 바꾸고 실패하면 되돌린다 (useConsumeInventoryItem과 같은 결).
 * 다만 주간 영양 합계는 낙관적으로 못 고친다 — RecipeListItem에는 칼로리만 있고
 * 탄단지·나트륨이 없어서다. 그래서 합계는 서버 응답이 온 뒤에 갱신하고,
 * 그 사이에는 화면이 "합계 다시 계산 중"이라고 말해준다.
 */
export function useUpdateMealPlanEntry(weekStart: string) {
  const queryClient = useQueryClient();
  const queryKey = mealPlanQueryKey(weekStart);

  return useMutation<
    UpdateMealPlanEntryResponse,
    Error,
    UpdateMealPlanEntryVariables,
    { previous?: MealPlanResponse }
  >({
    mutationFn: ({ entryId, recipe, source }) => {
      if (isFixturePreview()) {
        return updateMealPlanEntryFixture(entryId, recipe, source);
      }
      return apiFetch<UpdateMealPlanEntryResponse>(
        `/api/meal-plan/entries/${entryId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            recipeId: recipe.id,
          } satisfies UpdateMealPlanEntryRequest),
        },
      );
    },
    onMutate: async ({ entryId, recipe, source }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MealPlanResponse>(queryKey);
      if (previous) {
        queryClient.setQueryData<MealPlanResponse>(queryKey, {
          ...previous,
          slots: previous.slots.map((slot) =>
            slot.id === entryId
              ? {
                  ...slot,
                  recipe,
                  matchScore: recipe.match.score,
                  missingMainIngredients: recipe.match.missingMainIngredients,
                  source,
                }
              : slot,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (data) => {
      // 서버가 확정한 칸(점수·부족 재료·source)과 다시 계산한 주간 합계로 덮는다.
      queryClient.setQueryData<MealPlanResponse>(queryKey, (current) =>
        current
          ? {
              ...current,
              slots: current.slots.map((slot) =>
                slot.id === data.slot.id ? data.slot : slot,
              ),
              nutrition: data.nutrition,
            }
          : current,
      );
    },
    onSettled: (_data, _error, { entryId }) => {
      // 픽스처 모드에서 다시 받아오면 교체가 되돌려진 것처럼 보인다.
      if (isFixturePreview()) return;
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({
        queryKey: mealPlanCandidatesQueryKey(entryId),
      });
    },
  });
}

export interface RegenerateMealPlanVariables {
  /** true면 사용자가 손댄 칸까지 다시 짠다 (FR-12-01). */
  includeEdited: boolean;
}

/**
 * POST /api/meal-plan — 한 주 전체 재생성 (FR-12-01).
 *
 * 계약(types/api.ts)에 응답 타입이 없어서 MealPlanResponse가 온다고 보되,
 * 다르게 오더라도 화면이 깨지지 않도록 모양을 확인하고 아니면 다시 받아온다.
 */
export function useRegenerateMealPlan(weekStart: string) {
  const queryClient = useQueryClient();
  const queryKey = mealPlanQueryKey(weekStart);

  return useMutation<
    MealPlanResponse | null,
    Error,
    RegenerateMealPlanVariables
  >({
    mutationFn: async ({ includeEdited }) => {
      if (isFixturePreview()) {
        return regenerateMealPlanFixture(weekStart, includeEdited);
      }
      return apiFetch<MealPlanResponse>("/api/meal-plan", {
        method: "POST",
        body: JSON.stringify({
          weekStartDate: weekStart,
          includeEdited,
        } satisfies RegenerateMealPlanRequest),
      });
    },
    onSuccess: (data) => {
      if (data && Array.isArray(data.slots)) {
        queryClient.setQueryData(queryKey, data);
      } else if (!isFixturePreview()) {
        queryClient.invalidateQueries({ queryKey });
      }
      // 배치가 통째로 바뀌면 "이미 쓴 레시피" 목록도 달라져 후보가 낡는다.
      queryClient.invalidateQueries({ queryKey: MEAL_PLAN_CANDIDATES_KEY });
    },
  });
}
