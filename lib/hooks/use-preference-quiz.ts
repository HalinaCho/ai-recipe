"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PreferenceQuizResponse,
  RecipePreferenceRating,
} from "@/types/api";
import { apiFetch } from "./api-client";

// "recipes" 아래에 두지 않는다 — 평가 제출마다 ["recipes"] 접두사를 통째로
// 무효화하는데, 그 안에 이 쿼리키가 걸리면 카드를 한 장 넘길 때마다 배치가
// 통째로 다시 섞여 온다(실제로 겪은 버그). 퀴즈 배치는 "더 평가하기"를 눌렀을
// 때만 새로 받아야 한다.
export const PREFERENCE_QUIZ_QUERY_KEY = ["preference-quiz"] as const;

/** GET /api/recipes/preference-quiz — 마이페이지 "취향 설정"의 카드 묶음. */
export function usePreferenceQuiz() {
  return useQuery<PreferenceQuizResponse>({
    queryKey: PREFERENCE_QUIZ_QUERY_KEY,
    queryFn: () =>
      apiFetch<PreferenceQuizResponse>("/api/recipes/preference-quiz"),
    // 카드 순서를 서버가 매번 섞어 준다 — 캐시된 옛 배치를 계속 보여주지 않는다.
    staleTime: 0,
    retry: 1,
  });
}

export interface SubmitPreferenceVariables {
  recipeId: string;
  rating: RecipePreferenceRating;
}

/**
 * POST /api/recipes/preference-quiz — 카드 한 장 평가.
 *
 * 취향이 매칭 점수(레시피 탭·오늘의 추천·식단표)에 들어가므로 관련 쿼리를
 * 모두 무효화한다 — invalidateInventoryDerived와 같은 이유·같은 방식이다.
 */
export function useSubmitPreferenceRating() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SubmitPreferenceVariables>({
    mutationFn: (variables) =>
      apiFetch<void>("/api/recipes/preference-quiz", {
        method: "POST",
        body: JSON.stringify(variables),
      }),
    onSuccess: () => {
      for (const queryKey of [["recipes"], ["meal-plan"], ["shopping-list"]]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
