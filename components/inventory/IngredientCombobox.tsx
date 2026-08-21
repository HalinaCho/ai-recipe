"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { cn } from "@/lib/utils";

/**
 * 재료명 자동완성 (FR-04-07).
 *
 * 레시피에 실제로 쓰이는 이름 중에서 고르게 한다. 사용자가 "쇠고기"라고
 * 적으면 레시피는 "소고기"로 갖고 있어 매칭이 **오류 없이 0건**이 되는데,
 * 이건 화면상 "맞는 레시피가 없네"로만 보여서 알아채기가 어렵다.
 * 목록 밖 이름도 막지는 않되, 매칭이 안 될 수 있음을 분명히 알린다.
 */
export interface IngredientComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** 레시피 주재료 어휘. 로딩 중이면 빈 배열. */
  options: string[];
  disabled?: boolean;
}

const MAX_SUGGESTIONS = 8;

export function IngredientCombobox({
  value,
  onChange,
  options,
  disabled = false,
}: IngredientComboboxProps) {
  const [touched, setTouched] = useState(false);

  const suggestions = useMemo(() => {
    const query = value.trim();
    if (!query) return [];
    // 앞에서부터 일치하는 것을 먼저 — "파"를 치면 "파"·"파프리카"가
    // "대파"보다 위에 오는 게 자연스럽다.
    const starts: string[] = [];
    const contains: string[] = [];
    for (const option of options) {
      if (option === query) continue;
      if (option.startsWith(query)) starts.push(option);
      else if (option.includes(query)) contains.push(option);
      if (starts.length >= MAX_SUGGESTIONS) break;
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [value, options]);

  const trimmed = value.trim();
  const isKnown = trimmed !== "" && options.includes(trimmed);
  const showUnknownWarning = touched && trimmed !== "" && !isKnown;

  return (
    <div className="flex w-full flex-col gap-2">
      <Input
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setTouched(true);
        }}
        placeholder="재료 이름 (예: 두부, 대파)"
        aria-label="재료 이름"
        autoComplete="off"
      />

      {suggestions.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((option) => (
            <li key={option}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(option)}
                className={cn(
                  "flex min-h-12 items-center gap-2 rounded-full border-2 border-outline-variant bg-surface-container-lowest px-3",
                  "text-label-md text-on-surface transition-all active:scale-[0.97] disabled:opacity-50",
                )}
              >
                <IngredientIcon normalizedName={option} size="sm" />
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}

      {isKnown && (
        <p className="text-label-md text-on-tertiary-container">
          레시피에서 쓰이는 재료예요. 추천에 바로 반영돼요.
        </p>
      )}

      {showUnknownWarning && (
        <p className="text-label-md text-on-surface-variant">
          목록에 없는 이름이에요. 재고에는 담기지만 레시피 추천에는 안 잡힐 수
          있어요.
        </p>
      )}
    </div>
  );
}
