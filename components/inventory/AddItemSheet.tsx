"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { inferStorageType } from "@/lib/inventory/storage";
import {
  useCreateInventoryItem,
  useIngredientVocabulary,
} from "@/lib/hooks/use-inventory";
import type { StorageType } from "@/types/domain";
import { IngredientCombobox } from "./IngredientCombobox";
import { StorageTypePicker } from "./StorageTypePicker";

export interface AddItemSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * FR-04-06: 재고 직접 추가.
 *
 * 메일 파싱은 등록 쇼핑몰의 온라인 주문만 잡으므로 마트·시장에서 산 것이
 * 통째로 빠진다. 재고가 실제 냉장고와 어긋나면 그 위의 레시피 추천과
 * 식단표가 함께 틀리므로, 자동화가 놓친 것을 메우는 탈출구가 필요하다.
 */
export function AddItemSheet({ open, onClose }: AddItemSheetProps) {
  const vocabulary = useIngredientVocabulary();
  const create = useCreateInventoryItem();

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [storageType, setStorageType] = useState<StorageType>("refrigerated");
  const [storageTouched, setStorageTouched] = useState(false);

  // 시트를 새로 열 때마다 비운다.
  useEffect(() => {
    if (!open) return;
    setName("");
    setQuantity("");
    setStorageType("refrigerated");
    setStorageTouched(false);
    create.reset();
    // create는 매 렌더 새 객체라 의존성에 넣으면 무한 루프가 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 사용자가 직접 고르기 전까지는 재료명에서 추정해 따라간다 — 대부분
  // 맞으므로 손댈 일이 줄고, 틀리면 그대로 눌러 바꾸면 된다.
  useEffect(() => {
    if (storageTouched) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const inferred = inferStorageType(trimmed, trimmed);
    if (inferred !== "unknown") setStorageType(inferred);
  }, [name, storageTouched]);

  const canSubmit = name.trim() !== "" && !create.isPending;

  const handleSubmit = () => {
    create.mutate(
      {
        normalizedName: name.trim(),
        quantity: quantity.trim() || "1개",
        storageType,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex flex-col gap-5">
        <span
          aria-hidden
          className="mx-auto h-1.5 w-12 rounded-full bg-outline-variant"
        />

        <div className="flex flex-col gap-1 text-center">
          <p className="text-headline-md text-on-surface">재료 직접 담기</p>
          <p className="text-body-md text-on-surface-variant">
            마트에서 산 것처럼 메일에 없는 재료를 넣어요.
          </p>
        </div>

        <IngredientCombobox
          value={name}
          onChange={setName}
          options={vocabulary.data?.main ?? []}
          disabled={create.isPending}
        />

        <div className="flex flex-col gap-2">
          <label
            htmlFor="add-quantity"
            className="text-label-md text-on-surface-variant"
          >
            얼마나 샀어요? (선택)
          </label>
          <Input
            id="add-quantity"
            value={quantity}
            disabled={create.isPending}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="예: 1봉, 500g, 2개"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-label-md text-on-surface-variant">
            어디에 넣어두셨어요?
          </span>
          <StorageTypePicker
            value={storageType}
            onChange={(next) => {
              setStorageType(next);
              setStorageTouched(true);
            }}
            disabled={create.isPending}
          />
        </div>

        {create.isError && (
          <p
            role="alert"
            className="rounded-xl bg-error-container px-4 py-3 text-body-md text-on-error-container"
          >
            {create.error.message}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Button
            className="w-full"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {create.isPending ? "담는 중..." : "재고에 담기"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={create.isPending}
            onClick={onClose}
          >
            취소
          </Button>
        </div>
      </div>
    </Modal>
  );
}
