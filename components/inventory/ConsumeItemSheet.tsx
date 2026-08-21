"use client";

import { useEffect, useState } from "react";
import type { InventoryListItem } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatPurchaseDate, formatPurchasedAgo } from "./format";
import { IngredientCombobox } from "./IngredientCombobox";
import { RemainingPicker } from "./RemainingPicker";
import { StorageTypePicker } from "./StorageTypePicker";
import {
  useIngredientVocabulary,
  useUpdateInventoryItem,
} from "@/lib/hooks/use-inventory";

export interface ConsumeItemSheetProps {
  item: InventoryListItem | null;
  pending: boolean;
  /** remainingFraction은 쓰고 **남길** 비율 — 0이면 다 씀. */
  onConfirm: (item: InventoryListItem, remainingFraction: number) => void;
  onClose: () => void;
}

/**
 * FR-05-02·FR-05-03: 항목을 눌러 소진 처리한다.
 * FR-04-08: 같은 시트에서 "고치기"로 넘어가 값을 바로잡는다.
 *
 * 수정을 별도 화면이 아니라 여기에 둔 이유: 항목을 누르는 동작은 하나뿐인데
 * "쓴 걸 정리하러" 들어왔다가 값이 틀린 걸 발견하는 흐름이 대부분이다.
 * 두 화면으로 갈라 놓으면 어느 쪽으로 들어갈지 먼저 정하게 만들어야 한다.
 */
export function ConsumeItemSheet({
  item,
  pending,
  onConfirm,
  onClose,
}: ConsumeItemSheetProps) {
  // 기본값은 "다 썼어요" — 요리하고 나서 여는 경우가 대부분이다.
  const [remaining, setRemaining] = useState(0);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");

  const vocabulary = useIngredientVocabulary();
  const update = useUpdateInventoryItem();

  // 다른 항목을 열 때마다 선택과 편집 상태를 초기화한다.
  useEffect(() => {
    if (!item) return;
    setRemaining(0);
    setEditing(false);
    setName(item.normalizedName);
    setQuantity(item.quantity);
    setPurchasedAt(item.purchasedAt);
    update.reset();
    // update는 매 렌더 새 객체라 의존성에 넣으면 무한 루프가 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (!item) {
    return (
      <Modal open={false} onClose={onClose}>
        <span />
      </Modal>
    );
  }

  const willEmpty = remaining <= 0;
  const unchanged = remaining >= item.remainingFraction;
  const canSave = name.trim() !== "" && !update.isPending;

  const handleSave = () => {
    update.mutate(
      {
        id: item.id,
        normalizedName: name.trim(),
        quantity: quantity.trim() || "1개",
        purchasedAt,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <Modal open onClose={onClose}>
      <div className="flex flex-col items-center gap-5 text-center">
        <span
          aria-hidden
          className="h-1.5 w-12 rounded-full bg-outline-variant"
        />

        <IngredientIcon normalizedName={item.normalizedName} size="lg" />

        {editing ? (
          <div className="flex w-full flex-col gap-4 text-left">
            <p className="text-headline-md text-center text-on-surface">
              항목 고치기
            </p>

            {/* 이름은 자동완성에서 고르게 한다. 목록 밖 이름을 그대로 두면
                매칭이 오류 없이 0건이 되는데, 그게 바로 이 기능이 필요해진
                이유였다 ("1두부"). */}
            <IngredientCombobox
              value={name}
              onChange={setName}
              options={vocabulary.data?.main ?? []}
              disabled={update.isPending}
            />

            <div className="flex flex-col gap-2">
              <label
                htmlFor="edit-quantity"
                className="text-label-md text-on-surface-variant"
              >
                수량
              </label>
              <Input
                id="edit-quantity"
                value={quantity}
                disabled={update.isPending}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="예: 1봉, 500g, 2개"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="edit-purchased-at"
                className="text-label-md text-on-surface-variant"
              >
                구매일
              </label>
              {/* 네이티브 날짜 입력. 직접 만든 달력보다 폰에서 훨씬 잘 돈다. */}
              <Input
                id="edit-purchased-at"
                type="date"
                value={purchasedAt}
                max={new Date().toISOString().slice(0, 10)}
                disabled={update.isPending}
                onChange={(event) => setPurchasedAt(event.target.value)}
              />
              <span className="text-label-sm text-on-surface-variant">
                구매일을 고치면 &ldquo;먼저 드세요&rdquo; 순서도 함께 바뀌어요.
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-label-md text-on-surface-variant">
                보관 방식
              </span>
              <StorageTypePicker
                value={item.storageType}
                disabled={update.isPending}
                onChange={(next) =>
                  update.mutate({ id: item.id, storageType: next })
                }
              />
            </div>

            {update.isError && (
              <p
                role="alert"
                className="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"
              >
                {update.error.message}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                disabled={!canSave}
                onClick={handleSave}
              >
                {update.isPending ? "고치는 중..." : "이대로 고치기"}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                disabled={update.isPending}
                onClick={() => setEditing(false)}
              >
                되돌리기
              </Button>
            </div>
          </div>
        ) : (
          <>
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

            {/* FR-04-08: 메일 파싱도 수동 입력도 값을 틀리게 남길 수 있다.
                이름이 어긋나면 매칭이 오류 없이 0건이 되므로, 고칠 길이
                눈에 보이는 곳에 있어야 한다. */}
            <Button
              variant="ghost"
              className="w-full"
              disabled={pending}
              onClick={() => setEditing(true)}
            >
              <span className="material-symbols-outlined text-xl" aria-hidden>
                edit
              </span>
              이름·수량·구매일 고치기
            </Button>

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
          </>
        )}
      </div>
    </Modal>
  );
}
