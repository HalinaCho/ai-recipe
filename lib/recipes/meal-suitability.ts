// FR-13-06: 끼니로 낼 수 있는 레시피인지 판정한다.
//
// 배경: 재고가 바닥난 요일은 후보가 전부 0점 동점이 되고, 그 틈으로 "건강
// 마늘 꿀환" 같은 게 저녁 칸에 올라왔다. 점수 공식을 손대서 막을 문제가
// 아니다 — 꿀환은 점수가 낮아야 하는 게 아니라 **애초에 저녁 후보가 아니다.**
//
// 판정 근거는 우리가 만든 규칙이 아니라 식약처 원본의 RCP_PAT2(요리종류)다.
// 1,156건이 반찬 574 / 일품 181 / 후식 142 / 밥 119 / 국&찌개 103 / 기타 37로
// 이미 분류되어 있다. 이름으로 추측하는 분류기를 새로 만드는 것보다 훨씬 정확하고,
// 틀렸을 때 원본을 고치면 된다는 점에서 책임 소재도 분명하다.

/** 끼니 칸에 낼 수 없는 요리종류 (RCP_PAT2 원문). */
const SNACK_CATEGORIES = new Set(["후식"]);

/**
 * 이 레시피가 끼니(점심·저녁)로 적합한가.
 *
 * category가 null이면 **끼니로 본다.** 분류를 아직 백필하지 않은 행이나
 * 다른 소스에서 온 행을 전부 간식으로 밀어내면 후보 풀이 통째로 비어
 * 식단표가 빈 칸이 되는데(FR-13-03 위반), 그건 꿀환이 한 번 뜨는 것보다
 * 훨씬 나쁜 실패다. 모르면 통과시키고, 아는 것만 막는다.
 */
export function isMealSuitable(category: string | null | undefined): boolean {
  if (!category) return true;
  return !SNACK_CATEGORIES.has(category.trim());
}

/** 간식(후식)인가 — 화면에서 배지를 붙일지 판단할 때 쓴다. */
export function isSnackCategory(category: string | null | undefined): boolean {
  return !isMealSuitable(category);
}

/**
 * 화면에 그대로 쓰는 분류 라벨. 원문이 이미 한국어라 번역할 것이 없고,
 * null일 때만 비운다 (억지로 "기타"를 붙이면 원본의 "기타"와 구분이 안 된다).
 */
export function categoryLabel(category: string | null | undefined): string | null {
  const trimmed = category?.trim();
  return trimmed ? trimmed : null;
}
