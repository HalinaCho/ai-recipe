"use client";

import { RECIPE_CATEGORIES } from "@/lib/recipes/meal-suitability";
import { cn } from "@/lib/utils";

export interface RecipeCategoryFilterProps {
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/**
 * FR-09-03: 레시피 종류 필터.
 *
 * 여러 개를 켤 수 있게 한 이유: "국이랑 반찬 같이 보기"가 실제로 흔한 요구다.
 * 하나만 고르게 하면 국을 정하고 반찬을 정하려고 두 번 오가야 한다.
 *
 * 아무것도 안 고른 상태가 곧 "전체"다. 별도의 전체 칩을 두지 않고 켜진 게
 * 없으면 전부 보여준다 — "전체"와 "반찬"이 동시에 켜진 애매한 상태가
 * 아예 생기지 않는다.
 */
export function RecipeCategoryFilter({
  selected,
  onChange,
}: RecipeCategoryFilterProps) {
  const active = new Set(selected);

  const toggle = (category: string) => {
    const next = new Set(active);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    onChange([...next]);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* 칩이 여섯 개라 좁은 화면에서 줄바꿈보다 가로 스크롤이 낫다 —
          줄바꿈하면 목록이 두 줄씩 밀려 첫 레시피가 화면 밖으로 나간다.
          -mx/px로 스크롤 영역만 화면 끝까지 늘려 잘린 느낌을 없앤다. */}
      <div className="-mx-container-padding overflow-x-auto px-container-padding">
        <div className="flex w-max gap-2">
          <FilterChip
            label="전체"
            active={active.size === 0}
            onClick={() => onChange([])}
          />
          {RECIPE_CATEGORIES.map((category) => (
            <FilterChip
              key={category}
              label={category === "후식" ? "후식·간식" : category}
              active={active.has(category)}
              onClick={() => toggle(category)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-12 shrink-0 rounded-full px-4 text-label-md transition-all active:scale-[0.97]",
        active
          ? "bg-primary text-on-primary shadow-tinted"
          : "border-2 border-outline-variant bg-surface-container-lowest text-on-surface-variant",
      )}
    >
      {label}
    </button>
  );
}
