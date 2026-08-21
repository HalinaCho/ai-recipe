"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumeInventoryItemRequest,
  ConsumeInventoryItemResponse,
  CreateInventoryItemRequest,
  CreateInventoryItemResponse,
  IngredientVocabularyResponse,
  InventoryListResponse,
  UpdateInventoryItemRequest,
} from "@/types/api";
import type { StorageType } from "@/types/domain";
import { apiFetch } from "./api-client";
import { isFixturePreview, loadInventoryFixture } from "./fixture-preview";

export const INVENTORY_QUERY_KEY = ["inventory"] as const;

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
      queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY });
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
      queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY });
    },
  });
}

/** PATCH /api/inventory/[id] — 보관 방식 수정 (FR-04-05). */
export function useUpdateStorageType() {
  const queryClient = useQueryClient();

  return useMutation<
    ConsumeInventoryItemResponse,
    Error,
    { id: string; storageType: StorageType }
  >({
    mutationFn: ({ id, storageType }) =>
      apiFetch<ConsumeInventoryItemResponse>(`/api/inventory/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ storageType } satisfies UpdateInventoryItemRequest),
      }),
    onSuccess: () => {
      // 보관 방식이 바뀌면 경과율이 바뀌어 목록 순서도 달라진다.
      queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY });
    },
  });
}
