"use client";

import { useSyncExternalStore } from "react";

/**
 * 재고가 바뀌면(추가·수정·소진·요리함) 레시피 목록이 이미 자동으로 다시
 * 계산되지만, 그건 화면 뒤에서 조용히 일어나 사용자가 확인할 방법이 없다.
 * 이 스토어는 "마지막으로 언제 바뀌었는지"만 기억한다 — 화면은 자기가 받은
 * 데이터의 갱신 시각과 이 값을 비교해서 "방금 반영됐어요"를 보여준다.
 *
 * 별도 상태관리 라이브러리 없이 React 내장 useSyncExternalStore로 충분해
 * 새 의존성을 늘리지 않는다.
 */

let changedAt: number | null = null;
const listeners = new Set<() => void>();

export function markInventoryChanged(): void {
  changedAt = Date.now();
  for (const listener of listeners) listener();
}

export function getInventoryChangedAt(): number | null {
  return changedAt;
}

export function subscribeInventoryChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInventoryChangedAt(): number | null {
  return useSyncExternalStore(
    subscribeInventoryChanged,
    getInventoryChangedAt,
    () => null,
  );
}
