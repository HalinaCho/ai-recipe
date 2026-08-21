"use client";

import { useEffect, useState } from "react";
import type { InventoryListItem } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { Modal } from "@/components/ui/Modal";
import { formatPurchaseDate, formatPurchasedAgo } from "./format";
import { RemainingPicker } from "./RemainingPicker";
import { StorageTypePicker } from "./StorageTypePicker";
import { useUpdateStorageType } from "@/lib/hooks/use-inventory";

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
 * 예전에는 "다 먹었어요 / 아직 남아 있어요" 두 갈래뿐이라 반만 쓴 재료를
 * 표현할 방법이 없었고, 그렇게 어긋난 재고 위에 레시피 추천과 식단표가
 * 세워졌다. 이제 ¼ 단위로 남은 양을 고른다 (단위 환산은 없다 — FR-05-04).
 */
export function ConsumeItemSheet({
  item,
  pending,
  onConfirm,
  onClose,
}: ConsumeItemSheetProps) {
  // 기본값은 "다 썼어요" — 요리하고 나서 여는 경우가 대부분이다.
  const [remaining, setRemaining] = useState(0);
  const updateStorage = useUpdateStorageType();

  // 다른 항목을 열 때마다 선택을 초기화한다.
  useEffect(() => {
    if (item) setRemaining(0);
  }, [item]);

  const willEmpty = remaining <= 0;
  const unchanged = item !== null && remaining >= item.remainingFraction;

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

          <p className="text-body-lg text-on-surface">얼마나 남았어요?</p>

          <RemainingPicker
            value={remaining}
            max={item.remainingFraction}
            onChange={setRemaining}
            disabled={pending}
          />

          <p className="text-label-md text-on-surface-variant">
            {willEmpty
              ? "재고에서 빼요. 되돌릴 수 없어요."
              : "남은 만큼 재고에 그대로 둘게요."}
          </p>

          {/* FR-04-05: 보관 방식 추정이 틀렸으면 여기서 바로 고친다 —
              경과율이 달라져 목록 순서와 "먼저 드세요" 판단이 바뀐다. */}
          <div className="flex w-full flex-col gap-2">
            <span className="text-label-md text-on-surface-variant">
              보관 방식
            </span>
            <StorageTypePicker
              value={item.storageType}
              disabled={pending || updateStorage.isPending}
              onChange={(next) =>
                updateStorage.mutate({ id: item.id, storageType: next })
              }
            />
          </div>

          <div className="flex w-full flex-col gap-2">
            <Button
              className="w-full"
              disabled={pending || unchanged}
              onClick={() => onConfirm(item, remaining)}
            >
              {pending ? "정리하는 중..." : "이대로 저장"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={onClose}>
              그냥 둘래요
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
