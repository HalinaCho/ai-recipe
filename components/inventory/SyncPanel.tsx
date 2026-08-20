"use client";

import Link from "next/link";
import type { SyncResponse } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export interface SyncPanelProps {
  isPending: boolean;
  result?: SyncResponse;
  error?: Error | null;
  onSync: () => void;
}

/** Indeterminate bar — DESIGN.md "Progress Bars": 12px track, fully rounded. */
export function SyncProgressBar({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label={label}
        className="h-3 w-full overflow-hidden rounded-full bg-primary-container"
      >
        <div className="h-full w-1/2 animate-pulse rounded-full bg-primary-fixed-dim" />
      </div>
      <p className="text-label-md text-on-surface-variant">{label}</p>
    </div>
  );
}

/**
 * FR-02-02 manual sync. Per-connection failures from SyncResponse.connections
 * are always shown — a household with two mailboxes needs to know which one
 * stopped working.
 */
export function SyncPanel({ isPending, result, error, onSync }: SyncPanelProps) {
  const failed = result?.connections.filter((c) => c.status === "failed") ?? [];
  const succeeded = result?.connections.filter((c) => c.status === "success") ?? [];

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-2xl text-primary">
          mark_email_read
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-body-lg text-on-surface">새 주문내역 확인하기</p>
          <p className="text-body-md text-on-surface-variant">
            매일 새벽에 자동으로 확인하지만, 방금 주문했다면 지금 눌러도 돼요.
          </p>
        </div>
      </div>

      <Button className="w-full" onClick={onSync} disabled={isPending}>
        <span className="material-symbols-outlined text-xl">sync</span>
        {isPending ? "확인하는 중..." : "지금 동기화"}
      </Button>

      {isPending && <SyncProgressBar label="메일함에서 주문내역을 찾고 있어요" />}

      {!isPending && result && (
        <div className="flex flex-col gap-2 rounded-xl bg-tertiary-container p-3">
          <p className="text-body-md text-on-tertiary-container">
            {result.addedItemCount > 0
              ? `메일 ${result.processedMailCount}통을 읽고 재료 ${result.addedItemCount}개를 담았어요.`
              : `메일 ${result.processedMailCount}통을 확인했어요. 새로 담을 재료는 없었어요.`}
          </p>
          {succeeded.length > 0 && (
            <p className="text-label-md text-on-tertiary-container">
              확인한 메일함: {succeeded.map((c) => c.emailAddress).join(", ")}
            </p>
          )}
        </div>
      )}

      {!isPending &&
        failed.map((connection) => (
          <div
            key={connection.mailConnectionId}
            className="flex flex-col gap-2 rounded-xl bg-error-container p-3"
          >
            <p className="text-body-md text-on-error-container">
              {connection.emailAddress} 메일함은 확인하지 못했어요.
            </p>
            {connection.error && (
              <p className="text-label-md text-on-error-container/80">
                {connection.error}
              </p>
            )}
            <Link href="/settings/mail-connections">
              <Button variant="secondary" className="w-full">
                메일 계정 확인하기
              </Button>
            </Link>
          </div>
        ))}

      {!isPending && error && (
        <div className="rounded-xl bg-error-container p-3">
          <p className="text-body-md text-on-error-container">
            동기화하지 못했어요. {error.message}
          </p>
        </div>
      )}
    </Card>
  );
}
