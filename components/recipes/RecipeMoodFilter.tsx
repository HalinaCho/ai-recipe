"use client";

import { MOODS } from "@/lib/recipes/mood";
import { cn } from "@/lib/utils";

export interface RecipeMoodFilterProps {
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/**
 * FR-09-08: "오늘 뭐 땡겨요" 무드 필터.
 *
 * FR-09-03 종류 필터(반찬·국&찌개 등)와 같은 다중 선택 칩 UI를 쓴다 — 다만
 * 이건 "무엇을 만들 수 있는가"가 아니라 "오늘 어떤 기분인가"의 축이라 별도
 * 줄로 둔다. 아무것도 안 고른 상태가 "전체"인 것도 종류 필터와 동일하다.
 */
export function RecipeMoodFilter({ selected, onChange }: RecipeMoodFilterProps) {
  const active = new Set(selected);

  const toggle = (mood: string) => {
    const next = new Set(active);
    if (next.has(mood)) next.delete(mood);
    else next.add(mood);
    onChange([...next]);
  };

  return (
    <div className="-mx-container-padding overflow-x-auto px-container-padding">
      <div className="flex w-max gap-2">
        {MOODS.map((mood) => (
          <button
            key={mood}
            type="button"
            onClick={() => toggle(mood)}
            aria-pressed={active.has(mood)}
            className={cn(
              "min-h-12 shrink-0 rounded-full px-4 text-label-md transition-all active:scale-[0.97]",
              active.has(mood)
                ? "bg-secondary text-on-secondary shadow-tinted"
                : "border-2 border-outline-variant bg-surface-container-lowest text-on-surface-variant",
            )}
          >
            {mood}
          </button>
        ))}
      </div>
    </div>
  );
}
