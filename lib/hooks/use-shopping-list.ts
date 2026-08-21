"use client";

import { useQuery } from "@tanstack/react-query";
import type { ShoppingListResponse } from "@/types/api";
import { apiFetch } from "./api-client";

export const SHOPPING_LIST_QUERY_KEY = ["shopping-list"] as const;

/**
 * GET /api/shopping-list — 이번 주 부족 재료 (FR-17-02).
 *
 * 재고를 바꾸면 부족 재료도 달라지므로 invalidateInventoryDerived가 이 키도
 * 함께 턴다. 여기서는 그 키 접두사만 맞춰 두면 된다.
 */
export function useShoppingList(weekStart?: string) {
  return useQuery<ShoppingListResponse>({
    queryKey: [...SHOPPING_LIST_QUERY_KEY, weekStart ?? "current"],
    queryFn: () =>
      apiFetch<ShoppingListResponse>(
        weekStart
          ? `/api/shopping-list?weekStart=${weekStart}`
          : "/api/shopping-list",
      ),
    staleTime: 60_000,
    retry: 1,
  });
}
