"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddShoppingSenderDomainRequest,
  ShoppingSenderDomainsResponse,
} from "@/types/api";
import { apiFetch } from "./api-client";

export const SHOPPING_DOMAINS_QUERY_KEY = ["shopping-domains"] as const;

/** GET /api/shopping-domains — built-in defaults + this household's additions. */
export function useShoppingDomains() {
  return useQuery<ShoppingSenderDomainsResponse>({
    queryKey: SHOPPING_DOMAINS_QUERY_KEY,
    queryFn: () =>
      apiFetch<ShoppingSenderDomainsResponse>("/api/shopping-domains"),
    retry: 1,
  });
}

export function useAddShoppingDomain() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, string>({
    mutationFn: (domain) =>
      apiFetch("/api/shopping-domains", {
        method: "POST",
        body: JSON.stringify({
          domain,
        } satisfies AddShoppingSenderDomainRequest),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_DOMAINS_QUERY_KEY });
    },
  });
}

/** DELETE /api/shopping-domains?id=<id> — custom rows only. */
export function useRemoveShoppingDomain() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/shopping-domains?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SHOPPING_DOMAINS_QUERY_KEY });
    },
  });
}
