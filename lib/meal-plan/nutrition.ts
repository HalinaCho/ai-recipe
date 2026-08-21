// FR-14-01: 주간 영양 합계. 정보 제공 수준이며 목표치 비교는 하지 않는다(FR-14-02).
//
// 이 파일의 존재 이유는 사실상 **null 처리** 하나다. recipe 테이블의 영양
// 컬럼은 전부 nullable이고(식약처 원본에 값이 없는 행이 있을 수 있다),
// null을 0으로 치면 합계만 봤을 때 "이번 주엔 적게 먹네"로 오해된다.
// 그래서 합계와 함께 **몇 끼가 합계에 반영됐는지**를 돌려준다.

import type { WeeklyNutritionSummary } from "@/types/api";

/** 한 끼의 영양 정보. Recipe.nutrition과 같은 모양이다. */
export interface SlotNutrition {
  calories: number | null;
  carbohydrate: number | null;
  protein: number | null;
  fat: number | null;
  sodium: number | null;
}

const FIELDS = [
  "calories",
  "carbohydrate",
  "protein",
  "fat",
  "sodium",
] as const;

/**
 * 주간 합계.
 *
 * `coveredSlots`는 "영양 정보가 **하나라도** 있는 끼니 수"다. 다섯 항목이
 * 통째로 있거나 통째로 없는 게 대부분이라 이 정의로 충분하고, 일부만 있는
 * 행은 있는 항목만 더해진다 (없는 항목을 0으로 채워 넣지 않는다).
 *
 * 소수점 한 자리로 자르는 이유: 부동소수 합이 1234.0000000002 같은 값을
 * 만들어 화면에 그대로 새는 것을 막기 위해서다. 애초에 정보 제공 수준의
 * 숫자라 한 자리 이상의 정밀도는 의미가 없다.
 */
export function summarizeWeeklyNutrition(
  slots: readonly (SlotNutrition | null | undefined)[],
): WeeklyNutritionSummary {
  const totals: Record<(typeof FIELDS)[number], number> = {
    calories: 0,
    carbohydrate: 0,
    protein: 0,
    fat: 0,
    sodium: 0,
  };

  let coveredSlots = 0;

  for (const slot of slots) {
    if (!slot) continue;

    let hasAny = false;
    for (const field of FIELDS) {
      const value = slot[field];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      totals[field] += value;
      hasAny = true;
    }
    if (hasAny) coveredSlots += 1;
  }

  return {
    calories: round1(totals.calories),
    carbohydrate: round1(totals.carbohydrate),
    protein: round1(totals.protein),
    fat: round1(totals.fat),
    sodium: round1(totals.sodium),
    coveredSlots,
    totalSlots: slots.length,
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
