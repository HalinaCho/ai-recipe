"use client";

import Link from "next/link";
import { useState } from "react";
import type { MailConnectionSummary } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { formatRelativeTime } from "@/components/inventory/format";
import {
  useDisconnectMailConnection,
  useMailConnections,
} from "@/lib/hooks/use-mail-connections";

const PROVIDER_LABEL: Record<MailConnectionSummary["provider"], string> = {
  gmail: "Gmail",
  naver: "네이버메일",
};

const RECONNECT_HREF: Record<MailConnectionSummary["provider"], string> = {
  gmail: "/mail-connect/gmail",
  naver: "/mail-connect/naver",
};

/** Anything that isn't "active" means the mailbox has stopped being read. */
function statusNotice(status: MailConnectionSummary["status"]) {
  if (status === "expired") {
    return {
      label: "다시 연결이 필요해요",
      description:
        "메일함 사용 권한이 만료돼서 새 주문내역을 못 읽고 있어요. 다시 연결해주세요.",
    };
  }
  if (status === "revoked") {
    return {
      label: "연결이 끊겼어요",
      description:
        "메일함 쪽에서 연결이 해제됐어요. 계속 쓰시려면 다시 연결해주세요.",
    };
  }
  return null;
}

export default function MailConnectionsSettingsPage() {
  const { data, isPending, isError, error, refetch } = useMailConnections();
  const disconnect = useDisconnectMailConnection();
  const [pendingDisconnect, setPendingDisconnect] =
    useState<MailConnectionSummary | null>(null);

  const connections = data?.connections ?? [];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar
        title="연결된 메일 계정"
        action={
          <Link
            href="/settings"
            aria-label="설정으로 돌아가기"
            className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </Link>
        }
      />

      <div className="flex flex-col gap-3 px-container-padding pb-8">
        <p className="px-1 text-body-md text-on-surface-variant">
          연결된 메일함에서 주문내역만 읽어와요. 메일을 보내거나 지우지
          않아요.
        </p>

        {isPending && (
          <div className="flex flex-col gap-3" aria-hidden>
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-xl bg-surface-container-lowest shadow-tinted"
              />
            ))}
          </div>
        )}

        {isError && (
          <Card className="flex flex-col gap-3 p-4">
            <p className="text-body-md text-on-surface-variant">
              메일 계정을 불러오지 못했어요.{" "}
              {error instanceof Error ? error.message : ""}
            </p>
            <Button variant="secondary" onClick={() => void refetch()}>
              다시 시도하기
            </Button>
          </Card>
        )}

        {!isPending && !isError && connections.length === 0 && (
          <Card className="flex flex-col items-center gap-4 p-6 text-center">
            <span className="text-5xl" aria-hidden>
              📮
            </span>
            <p className="text-body-lg text-on-surface">
              아직 연결된 메일 계정이 없어요
            </p>
            <p className="text-body-md text-on-surface-variant">
              Gmail이나 네이버메일을 연결하면 주문한 식재료가 자동으로
              재고에 담겨요.
            </p>
          </Card>
        )}

        {connections.map((connection) => {
          const notice = statusNotice(connection.status);
          return (
            <Card key={connection.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <span
                  className={
                    connection.provider === "gmail"
                      ? "material-symbols-outlined text-3xl text-primary"
                      : "material-symbols-outlined text-3xl text-secondary"
                  }
                >
                  mail
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="text-body-lg text-on-surface">
                      {PROVIDER_LABEL[connection.provider]}
                    </p>
                    <Chip
                      tone="tertiary"
                      className={
                        notice ? "bg-error-container text-on-error-container" : ""
                      }
                    >
                      {notice ? notice.label : "연결됨"}
                    </Chip>
                  </div>
                  <p className="truncate text-body-md text-on-surface-variant">
                    {connection.emailAddress}
                  </p>
                  <p className="text-label-md text-on-surface-variant">
                    {formatRelativeTime(connection.lastSyncedAt)}
                  </p>
                </div>
              </div>

              {notice && (
                <div className="flex flex-col gap-2 rounded-xl bg-error-container p-3">
                  <p className="text-body-md text-on-error-container">
                    {notice.description}
                  </p>
                  <Link href={RECONNECT_HREF[connection.provider]}>
                    <Button className="w-full">다시 연결하기</Button>
                  </Link>
                </div>
              )}

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setPendingDisconnect(connection)}
              >
                연결 해제
              </Button>
            </Card>
          );
        })}

        <Link href="/mail-connect" className="pt-2">
          <Button variant="secondary" className="w-full">
            <span className="material-symbols-outlined text-xl">add</span>
            메일 계정 추가하기
          </Button>
        </Link>

        {disconnect.isError && (
          <Card className="p-4">
            <p className="text-body-md text-on-error-container">
              연결을 해제하지 못했어요.{" "}
              {disconnect.error instanceof Error ? disconnect.error.message : ""}
            </p>
          </Card>
        )}
      </div>

      <Modal
        open={pendingDisconnect !== null}
        onClose={() => setPendingDisconnect(null)}
      >
        {pendingDisconnect && (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-headline-md text-on-surface">
              연결을 해제할까요?
            </p>
            <p className="text-body-md text-on-surface-variant">
              {pendingDisconnect.emailAddress} 메일함에서 더 이상 주문내역을
              가져오지 않아요. 이미 담긴 재고는 그대로 남아요.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full bg-error text-on-error"
                disabled={disconnect.isPending}
                onClick={() =>
                  disconnect.mutate(pendingDisconnect.id, {
                    onSettled: () => setPendingDisconnect(null),
                  })
                }
              >
                {disconnect.isPending ? "해제하는 중..." : "연결 해제하기"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setPendingDisconnect(null)}
              >
                그대로 둘게요
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
