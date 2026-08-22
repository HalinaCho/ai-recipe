// FR-13-08: 한 끼니의 상차림 구성.
//
// 한식 한 끼는 국/찌개에 반찬이 곁들여진 모습이다. 한 칸에 반찬 하나만
// 놓으면 화면상 "저녁 = 두부무침"이 되어 실제로 그렇게 먹을 사람이 없다.
//
// 구성 규칙은 원본 분류(recipe.category, 식약처 RCP_PAT2)에서 나온다:
//   일품·밥  → 그 자체로 한 끼 (볶음밥·카레·국수). 곁들일 필요가 없다.
//   국&찌개  → 국물 한 그릇
//   반찬·기타 → 곁들임
//
// 맨밥은 레시피가 아니라서 따로 뽑지 않는다 — "당연히 있는 것"으로 친다.

import type { MealPlanDishRole } from "@/types/domain";

/** 그 자체로 한 끼가 되는 분류. */
const STANDALONE = new Set(["일품", "밥"]);
const SOUP = new Set(["국&찌개"]);

/** 원본 분류 → 상차림에서의 자리. 분류를 모르면 곁들임으로 본다. */
export function dishRoleOf(category: string | null | undefined): MealPlanDishRole {
  const trimmed = category?.trim() ?? "";
  if (STANDALONE.has(trimmed)) return "main";
  if (SOUP.has(trimmed)) return "soup";
  return "side";
}

/**
 * 한 끼니에 어떤 자리를 몇 개 채울지.
 *
 * 첫 요리가 일품이면 거기서 끝이고, 아니면 국 하나에 반찬을 붙인다.
 * 반찬 수는 상한이며, 후보가 모자라면 그만큼만 채운다 — 빈 자리를 만드는
 * 것보다 두 접시짜리 상이 낫다.
 */
export function remainingRoles(
  firstRole: MealPlanDishRole,
  sideCount: number,
): MealPlanDishRole[] {
  if (firstRole === "main") return [];
  if (firstRole === "soup") return Array<MealPlanDishRole>(sideCount).fill("side");
  // 첫 요리가 반찬이면 국을 하나 붙이고 반찬을 하나 줄인다.
  return ["soup", ...Array<MealPlanDishRole>(Math.max(0, sideCount - 1)).fill("side")];
}

/** 화면에 그대로 쓰는 자리 이름. */
export const DISH_ROLE_LABEL: Record<MealPlanDishRole, string> = {
  main: "한 그릇",
  soup: "국·찌개",
  side: "반찬",
  convenience: "간편식",
};
