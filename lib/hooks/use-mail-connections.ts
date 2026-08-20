"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MailConnectionsResponse } from "@/types/api";
import { apiFetch } from "./api-client";

export const MAIL_CONNECTIONS_QUERY_KEY = ["mail-connections"] as const;

/** GET /api/mail-connections — safe projection, never carries the secret. */
export function useMailConnections() {
  return useQuery<MailConnectionsResponse>({
    queryKey: MAIL_CONNECTIONS_QUERY_KEY,
    queryFn: () => apiFetch<MailConnectionsResponse>("/api/mail-connections"),
    retry: 1,
  });
}

/**
 * DELETE /api/mail-connections?id=<id>
 *
 * The published contract lists the route without an [id] segment, so the id
 * travels as a query parameter.
 */
export function useDisconnectMailConnection() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (id) =>
      apiFetch<void>(`/api/mail-connections?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MAIL_CONNECTIONS_QUERY_KEY });
    },
  });
}
