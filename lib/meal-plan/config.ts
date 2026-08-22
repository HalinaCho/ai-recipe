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
  /**
   * FR-13-07: 제철 감점의 세기 (0~1).
   *
   * 주재료 전부가 "사야 하는데 제철 아님"일 때 점수가 (1 - strength)배로
   * 줄어든다. 0.7이면 30%만 남는다 — 대안이 하나라도 있으면 확실히 밀려나되,
   * 후보가 마르면 배치는 되는 세기다. 완전 배제(1.0)로 두지 않는 이유는
   * FR-13-03이 빈 칸을 금지하기 때문이다.
   */
  seasonPenalty: number;
  /**
   * FR-13-08: 한 끼니에 붙일 반찬 수의 상한. 국 1 + 반찬 N이 기본 상차림이다.
   *
   * 2로 잡은 이유: 국 하나에 반찬 둘이면 상이 차 보이면서도, 한 주 10끼면
   * 요리 30가지라 장보기가 감당할 만한 선이다. 3으로 올리면 부족 재료가
   * 급격히 늘어 "살 게 너무 많은" 목록이 된다.
   */
  sidesPerMeal: number;
  /**
   * FR-13-09: 한 주에 같은 재료가 몇 번 넘게 쓰이면 감점을 시작할지.
   *
   * 재고에 두부가 있으면 후보 레시피 대부분이 두부를 쓰게 되어, 한 주가
   * 통째로 두부 요리로 깔린다. 앞에서 다 써버려 뒤쪽 끼니는 전부 0%가 되고
   * 장보기 목록도 한쪽으로 쏠린다.
   */
  repeatThreshold: number;
  /**
   * FR-13-09 감점의 세기 (0~1). 임계를 넘은 재료 비율만큼 점수를 깎는다.
   *
   * 실측(재고 9종·요리 19개 기준): 감점 없음이면 최다 재료가 13회 쓰이는데
   * 0.4면 9회, 0.8이면 8회로 줄고 서로 다른 재료는 43→46종으로 는다.
   * 0.7은 그 사이에서 고른 값이다.
   *
   * **임계(repeatThreshold)를 1로 낮추면 오히려 나빠진다** (11회). 모든 재료가
   * 첫 사용부터 감점되어 감점이 사실상 상수가 되고, 그러면 순위가 감점 전과
   * 같아지기 때문이다. 세기만 올리고 임계는 2로 둔다.
   */
  repeatPenalty: number;
  /**
   * FR-13-10: 한 주에 넣을 간편조리식 끼니 수.
   *
   * 2로 잡은 이유: 열 끼 중 둘이면 "요리 안 하는 주"로 보이지 않으면서도,
   * 바쁜 날 두 번은 데우기만 하면 되는 여지가 생긴다.
   */
  convenienceMealsPerWeek: number;
  /**
   * FR-13-11: 재고가 모자랄 때 간편식을 몇 끼까지 늘릴지.
   *
   * 재고가 적으면 뒤쪽 끼니가 전부 0%로 깔린다. 만들 수도 없는 요리를 줄줄이
   * 늘어놓는 것보다, "이런 걸 사두면 편해요"를 늘리는 편이 실제로 도움이 된다 —
   * 어차피 장을 봐야 하는 상황이고, 그게 이 서비스가 하려는 일이다.
   */
  convenienceMealsMax: number;
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
  seasonPenalty: 0.7,
  sidesPerMeal: 2,
  repeatThreshold: 2,
  repeatPenalty: 0.7,
  convenienceMealsPerWeek: 2,
  convenienceMealsMax: 4,
  swapCandidateCount: 20,
  candidatePoolSize: 300,
};

/** 주의 시작 요일. 월요일 고정 — FR-11-01이 "평일(월~금)"을 전제한다. */
export const WEEK_START_DAY = 1; // 0=일, 1=월
