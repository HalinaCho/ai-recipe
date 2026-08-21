// FR-13: 식단표 배치의 튜닝 손잡이. matching/config.ts와 같은 원칙으로,
// 점수 계산 코드 안에 0.5/0.3/0.2 같은 숫자가 직접 박히지 않게 한다.
//
// 이 파일은 M3 킥오프에서 확정된 계약의 일부다. 값은 실사용 후 튜닝하되,
// 구조(항의 개수와 의미)를 바꾸려면 배치 엔진과 테스트를 함께 손봐야 한다.

import type { IngredientCategory } from "@/types/domain";

export interface MealPlanConfig {
  /**
   * FR-13-04 공식의 세 항. 합이 1이 되도록 유지한다.
   *
   *   score = 매칭률 × matchRate
   *         + 소진임박 가중치 × expiring
   *         + 카테고리 다양성 보너스 × diversity
   *
   * M2의 매칭 공식(0.6/0.4)과 값이 다른 것은 의도적이다. 목록 추천은 "지금
   * 뭘 해먹지"라 보유율이 거의 전부지만, 식단표는 일주일치를 미리 짜는 것이라
   * 어차피 장을 봐야 하고, 그래서 같은 재료만 반복되지 않게 하는 항이 필요하다.
   */
  weights: {
    matchRate: number;
    expiring: number;
    diversity: number;
  };
  /**
   * 다양성 보너스를 계산할 구매 이력 기간(일). FR-13-04의 "최근 4주".
   * 너무 짧으면 표본이 적어 보너스가 요동치고, 너무 길면 최근에 바뀐 식습관을
   * 못 따라간다.
   */
  purchaseHistoryDays: number;
  /**
   * 다양성 보너스에서 셀 카테고리. seasoning은 뺀다 — 간장·소금은 매주 사는
   * 것도 아니고 "이번 주엔 뭘 먹을까"의 축이 아니다.
   */
  diversityCategories: readonly IngredientCategory[];
  /** FR-12-02: 스왑 모달에 뿌릴 후보 개수. */
  swapCandidateCount: number;
  /**
   * 배치 중 한 끼니를 고를 때 훑을 상위 후보 수. 전체 1,156개를 매 칸마다
   * 다시 점수 매기는 것은 낭비라, 재고 기반 상위 N만 재계산한다.
   */
  candidatePoolSize: number;
}

export const DEFAULT_MEAL_PLAN_CONFIG: MealPlanConfig = {
  weights: { matchRate: 0.5, expiring: 0.3, diversity: 0.2 },
  purchaseHistoryDays: 28,
  diversityCategories: [
    "vegetable",
    "dairy",
    "meat",
    "seafood",
    "grain",
    "other",
  ],
  swapCandidateCount: 20,
  candidatePoolSize: 300,
};

/** 주의 시작 요일. 월요일 고정 — FR-11-01이 "평일(월~금)"을 전제한다. */
export const WEEK_START_DAY = 1; // 0=일, 1=월
