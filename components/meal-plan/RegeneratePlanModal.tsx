"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export interface RegeneratePlanModalProps {
  open: boolean;
  /** 사용자가 직접 바꾼 칸 수 (source가 swapped·manual). */
  editedCount: number;
  isPending: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onConfirm: (includeEdited: boolean) => void;
}

/**
 * FR-12-01 재생성 확인.
 *
 * 재생성은 한 주를 통째로 다시 짜기 때문에, 사용자가 직접 고른 끼니가 소리 없이
 * 사라질 수 있다. 그래서 손댄 칸이 하나라도 있으면 반드시 물어보고, 기본값은
 * "직접 고른 건 그대로 두기"로 둔다. 되돌릴 수 없는 쪽이 기본이 되면 안 된다.
 *
 * 브라우저 confirm()은 쓰지 않는다 — 앱 톤과도 안 맞고, 이 환경에서는 화면이
 * 멈춘다.
 */
export function RegeneratePlanModal({
  open,
  editedCount,
  isPending,
  errorMessage,
  onClose,
  onConfirm,
}: RegeneratePlanModalProps) {
  return (
    <Modal open={open} onClose={isPending ? () => {} : onClose}>
      <div className="flex flex-col gap-4">
        <span
          aria-hidden
          className="mx-auto h-1.5 w-12 rounded-full bg-outline-variant"
        />

        <div className="flex flex-col gap-1">
          <h2 className="text-headline-md text-on-surface">
            이번 주 식단표를 다시 짤까요?
          </h2>
          <p className="text-body-md text-on-surface-variant">
            지금 재고를 기준으로 한 주치를 새로 골라드려요.
          </p>
        </div>

        <p className="rounded-xl bg-primary-container px-3 py-2.5 text-label-md text-on-primary-container">
          직접 고르거나 바꾼 끼니가 {editedCount}개 있어요. 그대로 두고 나머지만
          다시 짤 수 있어요.
        </p>

        {errorMessage && (
          <p className="rounded-xl bg-error-container px-3 py-2.5 text-label-md text-on-error-container">
            다시 짜지 못했어요. {errorMessage}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button
            className="w-full"
            disabled={isPending}
            onClick={() => onConfirm(false)}
          >
            {isPending ? "다시 짜는 중..." : "고른 끼니는 두고 다시 짜기"}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={isPending}
            onClick={() => onConfirm(true)}
          >
            직접 고른 {editedCount}개까지 전부 다시 짜기
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={isPending}
            onClick={onClose}
          >
            그냥 둘래요
          </Button>
        </div>
      </div>
    </Modal>
  );
}
