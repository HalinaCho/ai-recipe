"use client";

import { useEffect, useState } from "react";
import type { CookChecklistItem } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { formatPurchasedAgo } from "@/components/inventory/format";
import { useCookChecklist, useCookRecipe } from "@/lib/hooks/use-recipes";
import { useFixturePreview } from "@/lib/hooks/fixture-preview";
import { cn } from "@/lib/utils";

export interface CookChecklistModalProps {
  recipeId: string;
  recipeName: string;
  open: boolean;
  onClose: () => void;
}

/**
 * FR-05-01 "요리함" 체크리스트.
 *
 * 이 앱에서 사용자가 데이터를 실제로 지우는 유일한 자리다. 그래서
 * (1) 무엇이 빠지는지 재료를 하나씩 다 보여주고, (2) 기본값은 전부 체크지만
 * 언제든 뺄 수 있게 하고, (3) 확인 버튼에 개수를 박아둔다 —
 * "확인"이 아니라 "3개 빼고 요리 완료"라고 읽혀야 한다.
 */
export function CookChecklistModal({
  recipeId,
  recipeName,
  open,
  onClose,
}: CookChecklistModalProps) {
  const preview = useFixturePreview();
  const checklist = useCookChecklist(recipeId, open);
  const cook = useCookRecipe(recipeId);

  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [consumedCount, setConsumedCount] = useState<number | null>(null);

  const items = checklist.data?.items ?? [];

  // 기본값은 전부 체크 (FR-05-01). 목록이 새로 오면 다시 전부 체크로 돌린다.
  useEffect(() => {
    if (!open) return;
    setCheckedIds(items.map((item) => item.inventoryItemId));
    // items 배열은 매 렌더 새로 만들어지므로 데이터 객체 자체를 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, checklist.data]);

  // 모달이 닫히면 완료 화면도 초기화해 다음에 열 때 체크리스트부터 보이게 한다.
  useEffect(() => {
    if (!open) {
      setConsumedCount(null);
      cook.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (id: string) =>
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );

  const handleConfirm = () => {
    cook.mutate(checkedIds, {
      onSuccess: (result) => setConsumedCount(result.consumedCount),
    });
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="flex max-h-[80vh] flex-col gap-4">
        <span
          aria-hidden
          className="mx-auto h-1.5 w-12 shrink-0 rounded-full bg-outline-variant"
        />

        {consumedCount !== null ? (
          <CookDoneView
            count={consumedCount}
            preview={preview}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="flex shrink-0 flex-col gap-1">
              <h2 className="text-headline-md text-on-surface">
                {recipeName} 만드셨나요?
              </h2>
              <p className="text-body-md text-on-surface-variant">
                이 요리에 쓴 재료를 <b>재고에서 뺄게요.</b> 안 쓴 재료는 체크를
                풀어주세요.
              </p>
            </div>

            {checklist.isPending && (
              <div className="flex flex-col gap-2" aria-hidden>
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-16 animate-pulse rounded-xl bg-surface-container-low"
                  />
                ))}
              </div>
            )}

            {checklist.isError && (
              <div className="flex flex-col gap-3">
                <p className="text-body-md text-on-surface-variant">
                  재고 목록을 불러오지 못했어요.{" "}
                  {checklist.error instanceof Error
                    ? checklist.error.message
                    : ""}
                </p>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => void checklist.refetch()}
                >
                  다시 시도하기
                </Button>
              </div>
            )}

            {!checklist.isPending && !checklist.isError && items.length === 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-body-md text-on-surface-variant">
                  이 요리에 쓸 재료가 재고에 없네요. 뺄 게 없어서 그대로 둘게요.
                </p>
                <Button variant="secondary" className="w-full" onClick={onClose}>
                  닫기
                </Button>
              </div>
            )}

            {items.length > 0 && (
              <>
                <ul className="-mx-1 flex flex-1 flex-col gap-2 overflow-y-auto px-1">
                  {items.map((item) => (
                    <li key={item.inventoryItemId}>
                      <ChecklistRow
                        item={item}
                        checked={checkedIds.includes(item.inventoryItemId)}
                        onToggle={() => toggle(item.inventoryItemId)}
                      />
                    </li>
                  ))}
                </ul>

                <div className="flex shrink-0 flex-col gap-2">
                  <p
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-label-md",
                      checkedIds.length > 0
                        ? "bg-primary-container text-on-primary-container"
                        : "bg-surface-container-high text-on-surface-variant",
                    )}
                    aria-live="polite"
                  >
                    {checkedIds.length > 0
                      ? `체크한 ${checkedIds.length}개가 재고에서 빠져요. 되돌릴 수 없어요.`
                      : "체크한 재료가 없어요. 하나 이상 골라주세요."}
                  </p>

                  {cook.isError && (
                    <p className="rounded-xl bg-error-container px-3 py-2.5 text-label-md text-on-error-container">
                      정리하지 못했어요.{" "}
                      {cook.error instanceof Error ? cook.error.message : ""}
                    </p>
                  )}

                  <Button
                    className="w-full"
                    disabled={checkedIds.length === 0 || cook.isPending}
                    onClick={handleConfirm}
                  >
                    {cook.isPending
                      ? "재고에서 빼는 중..."
                      : checkedIds.length === 0
                        ? "뺄 재료를 골라주세요"
                        : `${checkedIds.length}개 빼고 요리 완료`}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={onClose}
                    disabled={cook.isPending}
                  >
                    취소
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function ChecklistRow({
  item,
  checked,
  onToggle,
}: {
  item: CookChecklistItem;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        "flex w-full min-h-12 items-center gap-3 rounded-xl border-2 p-3 text-left transition-all active:scale-[0.98] active:translate-y-0.5",
        checked
          ? "border-primary bg-primary-container/40"
          : "border-outline-variant bg-surface-container-low opacity-70",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2",
          checked
            ? "border-primary bg-primary text-on-primary"
            : "border-outline bg-surface-container-lowest",
        )}
        aria-hidden
      >
        {checked && (
          <span className="material-symbols-outlined text-[20px]">check</span>
        )}
      </span>

      <IngredientIcon
        normalizedName={item.normalizedName}
        size="sm"
        className="shrink-0 bg-surface-container-lowest"
      />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-lg text-on-surface">
          {item.normalizedName}
          <span className="text-label-md text-on-surface-variant">
            {" "}
            {item.quantity}
          </span>
        </span>
        <span className="line-clamp-1 text-label-md text-on-surface-variant">
          {item.rawName}
        </span>
        <span className="text-label-sm text-on-surface-variant">
          {formatPurchasedAgo(item.daysSincePurchase)}
        </span>
      </span>
    </button>
  );
}

function CookDoneView({
  count,
  preview,
  onClose,
}: {
  count: number;
  preview: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <span className="text-6xl" aria-hidden>
        🍽️
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-headline-md text-on-surface">맛있게 드세요!</p>
        <p className="text-body-md text-on-surface-variant" aria-live="polite">
          {preview
            ? `샘플 모드라 실제 재고는 그대로예요. (${count}개 선택)`
            : `재료 ${count}개를 재고에서 뺐어요.`}
        </p>
      </div>
      <Button className="w-full" onClick={onClose}>
        확인
      </Button>
    </div>
  );
}
