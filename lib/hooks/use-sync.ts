"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SyncResponse } from "@/types/api";
import { apiFetch } from "./api-client";
import { MAIL_CONNECTIONS_QUERY_KEY } from "./use-mail-connections";
import { INVENTORY_QUERY_KEY } from "./use-inventory";

/**
 * POST /api/sync — the manual 동기화 button (FR-02-02) and the first sync of
 * onboarding both run through here. On success the inventory list and the
 * connection list (whose lastSyncedAt just moved) are refetched.
 */
export function useSync() {
  const queryClient = useQueryClient();

  return useMutation<SyncResponse, Error, void>({
    mutationFn: () => apiFetch<SyncResponse>("/api/sync", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INVENTORY_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MAIL_CONNECTIONS_QUERY_KEY });
    },
  });
}

/** Connections that came back with status "failed" (never swallowed). */
export function failedConnections(result: SyncResponse | undefined) {
  return result?.connections.filter((c) => c.status === "failed") ?? [];
}
