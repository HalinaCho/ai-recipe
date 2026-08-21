"use client";

import { STORAGE_LABEL } from "@/lib/inventory/storage";
import { cn } from "@/lib/utils";
import type { StorageType } from "@/types/domain";

/**
 * 보관 방식 선택 (FR-04-04·FR-04-05).
 *
 * 수동 추가 폼과 기존 항목 수정 양쪽에서 같은 컴포넌트를 쓴다 — 어디서
 * 고르든 같은 선택지여야 사용자가 헷갈리지 않는다.
 */
const OPTIONS: { value: StorageType; icon: string }[] = [
  { value: "refrigerated", icon: "kitchen" },
  { value: "frozen", icon: "ac_unit" },
  { value: "room_temp", icon: "countertops" },
];

export interface StorageTypePickerProps {
  value: StorageType;
  onChange: (value: StorageType) => void;
  disabled?: boolean;
}

export function StorageTypePicker({
  value,
  onChange,
  disabled = false,
}: StorageTypePickerProps) {
  return (
    <div role="radiogroup" aria-label="보관 방식" className="flex w-full gap-2">
      {OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-all",
              "active:scale-[0.97] active:translate-y-0.5 disabled:opacity-50",
              active
                ? "bg-primary text-on-primary shadow-tinted"
                : "border-2 border-outline-variant bg-surface-container-lowest text-on-surface-variant",
            )}
          >
            <span className="material-symbols-outlined text-xl">
              {option.icon}
            </span>
            <span className="text-label-md">{STORAGE_LABEL[option.value]}</span>
          </button>
        );
      })}
    </div>
  );
}
