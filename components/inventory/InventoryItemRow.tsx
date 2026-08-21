"use client";

import type { InventoryListItem } from "@/types/api";
import { Chip } from "@/components/ui/Chip";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { STORAGE_LABEL } from "@/lib/inventory/storage";
import { cn } from "@/lib/utils";
import {
  EAT_SOON_RATIO,
  formatPurchasedAgoShort,
  formatRemainingFraction,
} from "./format";

export interface InventoryItemRowProps {
  item: InventoryListItem;
  /** True for the very first row of the FIFO list — the "eat me first" item. */
  isOldest?: boolean;
  onSelect: (item: InventoryListItem) => void;
}

export function InventoryItemRow({
  item,
  isOldest = false,
  onSelect,
}: InventoryItemRowProps) {
  const eatSoon = item.elapsedRatio >= EAT_SOON_RATIO;
  const remaining = formatRemainingFraction(item.remainingFraction);
  const storageLabel =
    item.storageType === "unknown" ? null : STORAGE_LABEL[item.storageType];

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      aria-label={`${item.normalizedName} ${item.quantity}, ${formatPurchasedAgoShort(item.daysSincePurchase)} 구매. 눌러서 소진 처리하기`}
      className={cn(
        "flex w-full min-h-[76px] items-center gap-4 rounded-xl bg-surface-container-lowest p-3 text-left shadow-tinted transition-all",
        "active:scale-[0.98] active:translate-y-0.5 hover:shadow-tinted-hover",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isOldest && "ring-2 ring-primary-fixed-dim",
      )}
    >
      <IngredientIcon
        normalizedName={item.normalizedName}
        size="md"
        className={cn("shrink-0", eatSoon && "bg-primary-container")}
      />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-body-lg text-on-surface">
            {item.normalizedName}
          </span>
          {isOldest && (
            <Chip tone="primary" className="shrink-0">
              먼저 드세요
            </Chip>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {storageLabel && (
            <span className="shrink-0 rounded-full bg-surface-container px-2 py-0.5 text-label-sm text-on-surface-variant">
              {storageLabel}
            </span>
          )}
          {remaining && (
            <span className="shrink-0 rounded-full bg-tertiary-container px-2 py-0.5 text-label-sm text-on-tertiary-container">
              {remaining}
            </span>
          )}
          <span className="truncate text-label-md text-on-surface-variant">
            {item.quantity} · {item.rawName}
          </span>
        </span>
      </span>

      <Chip tone={eatSoon ? "primary" : "secondary"} className="shrink-0">
        {formatPurchasedAgoShort(item.daysSincePurchase)}
      </Chip>
    </button>
  );
}
