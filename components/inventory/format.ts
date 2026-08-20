// Korean date/label formatting shared by the 재고·홈·설정 screens.
// Plain-spoken wording on purpose (PRD §2 Q10: some users are not
// tech-confident) — "14일 전에 샀어요", not "14d ago".

/** Long form for detail rows: "오늘 샀어요" / "14일 전에 샀어요". */
export function formatPurchasedAgo(daysSincePurchase: number): string {
  if (daysSincePurchase <= 0) return "오늘 샀어요";
  if (daysSincePurchase === 1) return "어제 샀어요";
  return `${daysSincePurchase}일 전에 샀어요`;
}

/** Compact form for chips: "오늘" / "어제" / "14일 전". */
export function formatPurchasedAgoShort(daysSincePurchase: number): string {
  if (daysSincePurchase <= 0) return "오늘";
  if (daysSincePurchase === 1) return "어제";
  return `${daysSincePurchase}일 전`;
}

/** "2026년 8월 6일" — shown in the 소진 확인 sheet next to the day count. */
export function formatPurchaseDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/** Relative wording for lastSyncedAt: "방금 전" … "3시간 전" … "8월 12일". */
export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "아직 동기화한 적 없어요";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "동기화 기록 없음";

  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "방금 전 동기화";
  if (minutes < 60) return `${minutes}분 전 동기화`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전 동기화`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전 동기화`;
  return `${date.getMonth() + 1}월 ${date.getDate()}일 동기화`;
}

/**
 * Items sitting around a week or more get the warm butter chip so the top of
 * the FIFO list reads as "eat me first" — an emphasis, not the old v1.2
 * three-section grouping (removed in PRD v1.3).
 */
export const EAT_SOON_DAYS = 7;
