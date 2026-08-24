"use client";

import { Input } from "@/components/ui/Input";

export interface RecipeSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * 재료명·레시피명 자유 검색 (예: "김치" → 김치찌개도, 김치 자체를 주재료로
 * 쓰는 다른 레시피도 찾는다). 실제 디바운스·검색 실행은 부모(RecipeList)가
 * 맡는다 — 여기는 입력창일 뿐이다.
 */
export function RecipeSearchInput({ value, onChange }: RecipeSearchInputProps) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
      >
        search
      </span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="재료나 레시피 이름으로 검색"
        aria-label="레시피 검색"
        className="pl-11 pr-10"
      />
      {value !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="검색어 지우기"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      )}
    </div>
  );
}
