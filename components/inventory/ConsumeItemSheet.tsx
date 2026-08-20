"use client";

import type { InventoryListItem } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { Modal } from "@/components/ui/Modal";
import { formatPurchaseDate, formatPurchasedAgo } from "./format";

export interface ConsumeItemSheetProps {
  item: InventoryListItem | null;
  pending: boolean;
  onConfirm: (item: InventoryListItem) => void;
  onClose: () => void;
}

/** FR-05-02: tap an item → confirm it's been eaten up → it leaves the list. */
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

          <div className="flex w-full flex-col gap-2">
            <Button
              className="w-full"
              disabled={pending}
              onClick={() => onConfirm(item)}
            >
              {pending ? "정리하는 중..." : "다 먹었어요"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={onClose}>
              아직 남아 있어요
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
