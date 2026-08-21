"use client";

import { useState } from "react";
import type { InventoryListItem } from "@/types/api";
import { Card } from "@/components/ui/Card";
import { useConsumeInventoryItem, useInventory } from "@/lib/hooks/use-inventory";
import { ConsumeItemSheet } from "./ConsumeItemSheet";
import { InventoryItemRow } from "./InventoryItemRow";
import {
  InventoryEmptyState,
  InventoryErrorCard,
  InventoryListSkeleton,
} from "./InventoryStates";
import { PreviewBadge } from "@/components/ui/PreviewBadge";

/**
 * FR-04-02 / FR-05-02: one flat FIFO list (oldest purchase first, exactly as
 * the server ordered it) where tapping a row marks it consumed. PRD v1.3
 * removed the old 오늘/이번주/여유 sections, so there is deliberately no
 * grouping here.
 */
export function InventoryList() {
  const { data, isPending, isError, error, refetch } = useInventory();
  const consume = useConsumeInventoryItem();
  const [selected, setSelected] = useState<InventoryListItem | null>(null);

  const items = data?.items ?? [];

  const handleConfirm = (item: InventoryListItem, remainingFraction: number) => {
    consume.mutate(
      { id: item.id, consumedVia: "manual", remainingFraction },
      { onSettled: () => setSelected(null) },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <PreviewBadge />

      {isPending && <InventoryListSkeleton />}

      {isError && (
        <InventoryErrorCard
          message={error instanceof Error ? error.message : "알 수 없는 오류예요."}
          onRetry={() => void refetch()}
        />
      )}

      {!isPending && !isError && items.length === 0 && <InventoryEmptyState />}

      {items.length > 0 && (
        <>
          <p className="px-1 text-label-md text-on-surface-variant">
            오래 둔 재료가 맨 위에 있어요. 다 먹은 재료는 눌러서 정리해주세요.
          </p>
          <ul className="flex flex-col gap-3">
            {items.map((item, index) => (
              <li key={item.id}>
                <InventoryItemRow
                  item={item}
                  isOldest={index === 0}
                  onSelect={setSelected}
                />
              </li>
            ))}
          </ul>
          <p className="px-1 pt-1 text-label-md text-on-surface-variant">
            모두 {items.length}개의 재료가 있어요.
          </p>
        </>
      )}

      {consume.isError && (
        <Card className="border-2 border-error-container p-4">
          <p className="text-body-md text-on-error-container">
            소진 처리를 못 했어요.{" "}
            {consume.error instanceof Error ? consume.error.message : ""}
          </p>
        </Card>
      )}

      <ConsumeItemSheet
        item={selected}
        pending={consume.isPending}
        onConfirm={handleConfirm}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
