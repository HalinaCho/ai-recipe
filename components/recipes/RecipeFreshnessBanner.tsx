"use client";

import { useEffect, useRef, useState } from "react";
import { useInventoryChangedAt } from "@/lib/hooks/recipe-freshness";

export interface RecipeFreshnessBannerProps {
  /** useRecipes()가 준 dataUpdatedAt — 이 목록이 실제로 데이터를 받은 시각. */
  dataUpdatedAt: number;
}

const CONFIRM_VISIBLE_MS = 1500;

/**
 * 재고가 바뀌면(추가·수정·소진·요리함) 레시피 목록은 이미 자동으로 다시
 * 계산되지만, 화면 뒤에서 조용히 일어나 사용자가 확인할 방법이 없다.
 *
 * 재고가 바뀐 시각(recipe-freshness)과 이 목록이 실제로 받아온 시각을 비교해,
 * 아직 못 따라잡았으면 "확인 중"을, 막 따라잡은 순간이면 "방금 반영됐어요"를
 * 잠깐 보여주고 사라진다. 이미 반영된 지 오래된 변경에는 뜨지 않는다 — 매번
 * 탭을 열 때마다 뜨면 안내가 무뎌진다.
 */
export function RecipeFreshnessBanner({
  dataUpdatedAt,
}: RecipeFreshnessBannerProps) {
  const changedAt = useInventoryChangedAt();
  const stale = changedAt !== null && changedAt > dataUpdatedAt;

  const wasStale = useRef(stale);
  const [showConfirmed, setShowConfirmed] = useState(false);

  useEffect(() => {
    if (wasStale.current && !stale) {
      setShowConfirmed(true);
      const timer = setTimeout(() => setShowConfirmed(false), CONFIRM_VISIBLE_MS);
      wasStale.current = stale;
      return () => clearTimeout(timer);
    }
    wasStale.current = stale;
  }, [stale]);

  if (stale) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-secondary-container px-3 py-2 text-label-md text-on-secondary-container">
        <span
          aria-hidden
          className="material-symbols-outlined animate-spin text-[18px]"
        >
          progress_activity
        </span>
        재고가 바뀌었어요 · 레시피를 다시 확인하고 있어요
      </p>
    );
  }

  if (showConfirmed) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-secondary-container px-3 py-2 text-label-md text-on-secondary-container">
        <span aria-hidden className="material-symbols-outlined text-[18px]">
          check_circle
        </span>
        방금 반영됐어요
      </p>
    );
  }

  return null;
}
