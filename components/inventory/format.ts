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
 * "먼저 드세요" 강조를 붙이는 경계 (FR-04-02).
 *
 * 예전에는 "7일 이상"이라는 고정 일수였는데, 그러면 5일 된 냉동식품이 5일 된
 * 상추와 똑같이 급해 보인다. 이제 보관방식별 기준일수 대비 경과율로 판단해
 * 냉동은 늦게, 냉장은 일찍 올라온다.
 */
export const EAT_SOON_RATIO = 0.6;

/** 남은 비율 표시. 1은 굳이 "1" 이라고 쓰지 않는다. */
export function formatRemainingFraction(fraction: number): string | null {
  if (fraction >= 1) return null;
  if (fraction <= 0) return null;
  // 흔한 분수는 분수로, 나머지는 퍼센트로 — "0.33 남음"보다 "⅓ 남음"이 읽힌다.
  if (Math.abs(fraction - 0.5) < 0.02) return "½ 남음";
  if (Math.abs(fraction - 0.33) < 0.03) return "⅓ 남음";
  if (Math.abs(fraction - 0.67) < 0.03) return "⅔ 남음";
  if (Math.abs(fraction - 0.25) < 0.02) return "¼ 남음";
  return `${Math.round(fraction * 100)}% 남음`;
}
