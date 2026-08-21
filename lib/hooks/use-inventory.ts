"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  ConsumeInventoryItemRequest,
  ConsumeInventoryItemResponse,
  CreateInventoryItemRequest,
  CreateInventoryItemResponse,
  IngredientVocabularyResponse,
  InventoryListResponse,
  UpdateInventoryItemRequest,
} from "@/types/api";
import { apiFetch } from "./api-client";
import { isFixturePreview, loadInventoryFixture } from "./fixture-preview";

export const INVENTORY_QUERY_KEY = ["inventory"] as const;

/**
 * 재고가 바뀌면 **재고에서 파생된 화면 전부**를 다시 받는다.
 *
 * 재고만 갈아 끼우면 방금 담은 재료가 재고 탭에는 뜨는데 레시피 상세는
 * 여전히 "사야 해요"라고 하고 식단표 매칭률도 안 움직인다. 오류가 안 나고
 * 숫자만 낡아 있어서 알아채기 어려운 종류의 버그다.
 *
 * 한 곳에 모아 둔 이유: 재고를 바꾸는 곳이 담기·소진·보관방식·요리함으로
 * 네 군데인데, 각자 무효화 목록을 들고 있으면 한 곳만 빠뜨려도 같은 증상이
 * 다시 난다. 실제로 요리함만 레시피를 갈고 식단표는 빠뜨리고 있었다.
 */
export function invalidateInventoryDerived(queryClient: QueryClient): void {
  for (const queryKey of [
    INVENTORY_QUERY_KEY,
    ["recipes"], // today·상세·요리함 체크리스트가 모두 이 접두사 아래에 있다
    ["meal-plan"],
  ]) {
    queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * GET /api/inventory — already FIFO-ordered by the server (FR-04-02), so the
 * UI never re-sorts; it just renders the array as given.
 */
export function useInventory() {
  return useQuery<InventoryListResponse>({
    queryKey: INVENTORY_QUERY_KEY,
    queryFn: () =>
      isFixturePreview()
        ? loadInventoryFixture()
        : apiFetch<InventoryListResponse>("/api/inventory"),
    staleTime: 30_000,
    retry: 1,
  });
}

export interface ConsumeInventoryItemVariables {
  id: string;
  consumedVia: ConsumeInventoryItemRequest["consumedVia"];
  /** 쓰고 남길 비율 (FR-05-03). 생략하면 전량 소진. */
  remainingFraction?: number;
}

/**
 * PATCH /api/inventory/[id] — FR-05-02 manual removal.
 *
 * The row disappears from the list the moment it is tapped (optimistic), and
 * is put back if the server rejects it.
 */
export function useConsumeInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation<
    ConsumeInventoryItemResponse | null,
    Error,
    ConsumeInventoryItemVariables,
    { previous?: InventoryListResponse }
  >({
    mutationFn: async ({ id, consumedVia, remainingFraction = 0 }) => {
      if (isFixturePreview()) {
        // No backend in preview mode; the optimistic removal stands in for it.
        await new Promise((resolve) => setTimeout(resolve, 350));
        return null;
      }
      return apiFetch<ConsumeInventoryItemResponse>(`/api/inventory/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          consumedVia,
          remainingFraction,
        } satisfies ConsumeInventoryItemRequest),
      });
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: INVENTORY_QUERY_KEY });
      const previous =
        queryClient.getQueryData<InventoryListResponse>(INVENTORY_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<InventoryListResponse>(INVENTORY_QUERY_KEY, {
          items: previous.items.filter((item) => item.id !== id),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(INVENTORY_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      // In preview mode a refetch would resurrect the item from the fixture.
      if (isFixturePreview()) return;
      invalidateInventoryDerived(queryClient);
    },
  });
}

export const INGREDIENT_VOCAB_QUERY_KEY = ["ingredients"] as const;

/**
 * GET /api/ingredients — 수동 추가 자동완성 어휘 (FR-04-07).
 * 레시피 인입 때만 바뀌는 값이라 오래 캐시한다.
 */
export function useIngredientVocabulary() {
  return useQuery<IngredientVocabularyResponse>({
    queryKey: INGREDIENT_VOCAB_QUERY_KEY,
    queryFn: () => apiFetch<IngredientVocabularyResponse>("/api/ingredients"),
    staleTime: 60 * 60_000,
    retry: 1,
  });
}

/** POST /api/inventory — 재고 직접 추가 (FR-04-06). */
export function useCreateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation<
    CreateInventoryItemResponse,
    Error,
    CreateInventoryItemRequest
  >({
    mutationFn: (input) =>
      apiFetch<CreateInventoryItemResponse>("/api/inventory", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      // 새 항목이 경과율 순 어디에 끼는지는 서버가 정하므로 그냥 다시 받는다.
      // 레시피·식단표도 함께 — 방금 담은 재료가 거기에도 반영돼야 한다.
      invalidateInventoryDerived(queryClient);
    },
  });
}

/** PATCH /api/inventory/[id] — 항목 수정 (FR-04-05 보관 방식, FR-04-08 나머지). */
export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();

  return useMutation<
    ConsumeInventoryItemResponse,
    Error,
    { id: string } & UpdateInventoryItemRequest
  >({
    mutationFn: ({ id, ...patch }) =>
      apiFetch<ConsumeInventoryItemResponse>(`/api/inventory/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch satisfies UpdateInventoryItemRequest),
      }),
    onSuccess: () => {
      // 이름이 바뀌면 매칭이, 구매일·보관방식이 바뀌면 경과율을 거쳐 소진임박
      // 판정과 식단표 배치까지 함께 움직인다.
      invalidateInventoryDerived(queryClient);
    },
  });
}
