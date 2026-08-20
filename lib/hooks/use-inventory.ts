"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumeInventoryItemRequest,
  ConsumeInventoryItemResponse,
  InventoryListResponse,
} from "@/types/api";
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
    mutationFn: async ({ id, consumedVia }) => {
      if (isFixturePreview()) {
        // No backend in preview mode; the optimistic removal stands in for it.
        await new Promise((resolve) => setTimeout(resolve, 350));
        return null;
      }
      return apiFetch<ConsumeInventoryItemResponse>(`/api/inventory/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ consumedVia } satisfies ConsumeInventoryItemRequest),
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
