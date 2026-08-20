// 레시피 화면에서 쓰는 표시 규칙. 재고 쪽 format.ts와 같은 태도로,
// 숫자를 그대로 던지지 않고 사람이 읽는 문장으로 바꾼다 (PRD §2 Q10).

import type { RecipeMatch } from "@/types/api";

/** matchRate(0~1) → "100%". 점수(score)는 정렬용이라 화면에 쓰지 않는다. */
export function formatMatchRate(matchRate: number): string {
  return `${Math.round(matchRate * 100)}%`;
}

/**
 * 매칭 정도에 따른 색 톤.
 * - full: 주재료가 다 있음 → 민트(성공)
 * - most: 거의 다 있음 → 버터(브랜드/주목)
 * - some: 절반 이하 → 중립. 못 만든다는 뜻이 아니라 장을 좀 봐야 한다는 뜻.
 */
export type MatchLevel = "full" | "most" | "some";

export function matchLevel(matchRate: number): MatchLevel {
  if (matchRate >= 1) return "full";
  if (matchRate >= 0.6) return "most";
  return "some";
}

/** 카드 한 줄 요약: "재료 4개 다 있어요" / "4개 중 2개 있어요". */
export function formatOwnedSummary(match: RecipeMatch): string {
  const owned = match.ownedMainIngredients.length;
  const total = owned + match.missingMainIngredients.length;
  if (total === 0) return "주재료 정보가 아직 없어요";
  if (match.missingMainIngredients.length === 0) {
    return `주재료 ${total}개 다 있어요`;
  }
  return `주재료 ${total}개 중 ${owned}개 있어요`;
}

/** 추천 이유 (FR-08-01의 소진임박 가중치): "두부·대파부터 쓸 수 있어요". */
export function formatExpiringReason(match: RecipeMatch): string | null {
  const names = match.usesExpiringIngredients;
  if (names.length === 0) return null;
  const shown = names.slice(0, 3).join("·");
  const rest = names.length - 3;
  return rest > 0
    ? `${shown} 외 ${rest}개부터 쓸 수 있어요`
    : `${shown}부터 쓸 수 있어요`;
}

/**
 * 받침 유무에 따라 주격 조사를 고른다 — "베이컨가"가 아니라 "베이컨이".
 * 재료명은 서버에서 오는 임의의 한국어라 조사를 고정으로 붙일 수 없다.
 */
function subjectParticle(word: string): "이" | "가" {
  const last = word.trim().at(-1);
  if (!last) return "가";
  const code = last.charCodeAt(0);
  // 한글 음절 영역이 아니면(숫자·영문 등) 부드러운 쪽으로 둔다.
  if (code < 0xac00 || code > 0xd7a3) return "가";
  return (code - 0xac00) % 28 === 0 ? "가" : "이";
}

/** 부족 재료 한 줄: "레몬, 아스파라거스가 없어요". */
export function formatMissingSummary(match: RecipeMatch): string | null {
  const names = match.missingMainIngredients;
  if (names.length === 0) return null;
  const shown = names.slice(0, 3).join(", ");
  const rest = names.length - 3;
  if (rest > 0) return `${shown} 외 ${rest}개가 없어요`;
  const lastShown = names[Math.min(names.length, 3) - 1];
  return `${shown}${subjectParticle(lastShown)} 없어요`;
}

/** "420kcal" / 값이 없으면 null. */
export function formatCalories(calories: number | null): string | null {
  return calories === null ? null : `${calories}kcal`;
}
