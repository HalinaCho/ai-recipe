"use client";

import { cn } from "@/lib/utils";

/**
 * 남은 양을 고르는 입력 (FR-05-03).
 *
 * 4분의 1 단위 다섯 칸으로 끊는다. 사람은 "63% 남음"을 알지 못하고 "반쯤",
 * "조금" 정도로 어림하므로, 자유 입력은 없는 정확도를 요구하게 된다.
 * 모바일에서 원탭으로 끝난다는 점도 슬라이더보다 낫다.
 */
export interface RemainingPickerProps {
  /** 0~1. 쓰고 **남길** 비율. */
  value: number;
  /** 현재 재고에 남아 있는 비율 — 이보다 많이 남길 수는 없다. */
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const STEPS = [
  { value: 0, label: "다 썼어요", short: "0" },
  { value: 0.25, label: "¼ 남음", short: "¼" },
  { value: 0.5, label: "½ 남음", short: "½" },
  { value: 0.75, label: "¾ 남음", short: "¾" },
  { value: 1, label: "그대로예요", short: "1" },
] as const;

export function RemainingPicker({
  value,
  max = 1,
  onChange,
  disabled = false,
}: RemainingPickerProps) {
  // 반만 남은 걸 다시 ¾로 되돌릴 수는 없으므로 현재 양까지만 보여준다.
  const choices = STEPS.filter((step) => step.value <= max + 0.001);

  return (
    <div
      role="radiogroup"
      aria-label="남은 양"
      className="flex w-full flex-col gap-2"
    >
      {choices.map((step) => {
        const active = Math.abs(value - step.value) < 0.01;
        return (
          <button
            key={step.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(step.value)}
            className={cn(
              "flex min-h-12 w-full items-center gap-3 rounded-xl px-4 text-left transition-all",
              "active:scale-[0.98] active:translate-y-0.5 disabled:opacity-50",
              active
                ? "bg-primary text-on-primary shadow-tinted"
                : "border-2 border-outline-variant bg-surface-container-lowest text-on-surface",
            )}
          >
            {/* 남은 양을 막대로도 보여준다 — 분수 기호보다 한눈에 읽힌다. */}
            <span
              aria-hidden
              className={cn(
                "h-3 w-16 shrink-0 overflow-hidden rounded-full",
                active ? "bg-on-primary/30" : "bg-primary-fixed",
              )}
            >
              <span
                className={cn(
                  "block h-full rounded-full",
                  active ? "bg-on-primary" : "bg-primary",
                )}
                style={{ width: `${step.value * 100}%` }}
              />
            </span>
            <span className="text-body-lg">{step.label}</span>
          </button>
        );
      })}
    </div>
  );
}
