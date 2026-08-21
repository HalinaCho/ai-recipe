"use client";

import type { InventoryListItem } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { Modal } from "@/components/ui/Modal";
import { formatPurchaseDate, formatPurchasedAgo } from "./format";

export interface ConsumeItemSheetProps {
  item: InventoryListItem | null;
  pending: boolean;
  /** remainingFraction은 쓰고 **남길** 비율 — 0이면 다 씀. */
  onConfirm: (item: InventoryListItem, remainingFraction: number) => void;
  onClose: () => void;
}

/**
 * FR-05-02·FR-05-03: 항목을 눌러 소진 처리한다.
 *
 * 예전에는 "다 먹었어요 / 아직 남아 있어요" 두 갈래뿐이라, 반만 쓴 재료를
 * 표현할 방법이 없어 재고가 현실과 어긋났다. 남은 양을 분수로 고른다
 * (단위 환산은 하지 않는다 — FR-05-04).
 */
const CHOICES: { label: string; hint: string; remaining: number }[] = [
  { label: "다 썼어요", hint: "재고에서 빼요", remaining: 0 },
  { label: "절반쯤 남았어요", hint: "½ 남김", remaining: 0.5 },
  { label: "조금 남았어요", hint: "⅓ 남김", remaining: 0.33 },
];

export function ConsumeItemSheet({
  item,
  pending,
  onConfirm,
  onClose,
}: ConsumeItemSheetProps) {
  return (
    <Modal open={item !== null} onClose={onClose}>
      {item && (
        <div className="flex flex-col items-center gap-5 text-center">
          <span
            aria-hidden
            className="h-1.5 w-12 rounded-full bg-outline-variant"
          />

          <IngredientIcon normalizedName={item.normalizedName} size="lg" />

          <div className="flex flex-col gap-1">
            <p className="text-headline-md text-on-surface">
              {item.normalizedName}
            </p>
            <p className="text-body-md text-on-surface-variant">
              {item.quantity} · {item.rawName}
            </p>
            <p className="text-label-md text-on-surface-variant">
              {formatPurchaseDate(item.purchasedAt)} ·{" "}
              {formatPurchasedAgo(item.daysSincePurchase)}
            </p>
          </div>

          <p className="text-body-md text-on-surface-variant">
            얼마나 쓰셨어요?
          </p>

          <div className="flex w-full flex-col gap-2">
            {CHOICES.map((choice) => (
              <Button
                key={choice.remaining}
                variant={choice.remaining === 0 ? "primary" : "secondary"}
                className="flex w-full items-center justify-between px-5"
                disabled={pending}
                onClick={() => onConfirm(item, choice.remaining)}
              >
                <span>{choice.label}</span>
                <span className="text-label-md opacity-70">{choice.hint}</span>
              </Button>
            ))}
            <Button variant="ghost" className="w-full" onClick={onClose}>
              그냥 둘래요
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
