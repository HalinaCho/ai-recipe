"use client";

import { useState } from "react";
import type { InventoryListItem } from "@/types/api";
import { Card } from "@/components/ui/Card";
import { useConsumeInventoryItem, useInventory } from "@/lib/hooks/use-inventory";
import { AddItemSheet } from "./AddItemSheet";
import { Button } from "@/components/ui/Button";
import { ConsumeItemSheet } from "./ConsumeItemSheet";
import { InventoryItemRow } from "./InventoryItemRow";
import {
  InventoryEmptyState,
  InventoryErrorCard,
  InventoryListSkeleton,
} from "./InventoryStates";
import { PreviewBadge } from "@/components/ui/PreviewBadge";

/**
 * FR-04-02 / FR-05-02: 서버가 정렬해 준 순서(보관방식별 경과율) 그대로인
 * 단일 리스트. 항목을 누르면 남은 양을 조정한다. PRD v1.3에서 오늘/이번주/여유
 * 3섹션 구조를 걷어냈으므로 여기서 그룹을 만들지 않는다.
 *
 * FR-04-06: 메일이 못 잡은 재료를 직접 담는 입구도 여기에 둔다.
 */
export function InventoryList() {
  const { data, isPending, isError, error, refetch } = useInventory();
  const consume = useConsumeInventoryItem();
  const [selected, setSelected] = useState<InventoryListItem | null>(null);
  const [adding, setAdding] = useState(false);

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
            먼저 써야 할 재료가 맨 위에 있어요. 쓴 재료는 눌러서 정리해주세요.
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

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => setAdding(true)}
      >
        <span className="material-symbols-outlined text-xl">add</span>
        재료 직접 담기
      </Button>

      {consume.isError && (
        <Card className="border-2 border-error-container p-4">
          <p className="text-body-md text-on-error-container">
            소진 처리를 못 했어요.{" "}
            {consume.error instanceof Error ? consume.error.message : ""}
          </p>
        </Card>
      )}

      <AddItemSheet open={adding} onClose={() => setAdding(false)} />

      <ConsumeItemSheet
        item={selected}
        pending={consume.isPending}
        onConfirm={handleConfirm}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
