// FR-08-01: 매칭 점수의 튜닝 손잡이는 전부 여기 모여 있다.
// PRD가 "가중치는 실사용 후 튜닝 가능하도록 하드코딩하지 않음"이라고 못 박았기
// 때문에, 점수 계산 코드 안에 0.6/0.4 같은 숫자가 직접 박히면 안 된다.
// 값을 바꾸고 싶으면 이 파일만 고치면 되고, 실험은 계산 함수에 다른 config를
// 넘겨서 한다 (모든 함수가 config를 마지막 인자로 받는다).

export interface MatchingConfig {
  /** FR-08-01 공식의 두 항. 합이 1이 되도록 유지한다. */
  weights: {
    /** 보유 주재료 비율에 붙는 가중치. */
    availability: number;
    /** 소진임박 재료 포함 비율에 붙는 가중치. */
    expiring: number;
  };
  /**
   * "소진임박 TOP N"의 N. 재고를 FIFO(구매일 오래된 순, FR-04-02)로 줄 세운 뒤
   * 앞에서 N개의 **서로 다른 재료명**을 소진임박으로 본다.
   *
   * 5로 잡은 이유: 유통기한 데이터가 없어(FR-04-03) "임박"의 근거가 구매 순서
   * 뿐이라, N이 너무 크면 재고 전체가 임박이 되어 두 번째 항이 상수처럼 굳고,
   * 너무 작으면 재료 한두 개가 추천을 독점한다. 한국 가정식 레시피의 주재료가
   * 보통 3~5개라 그 폭과 맞물리는 5를 출발점으로 삼는다.
   */
  expiringTopN: number;
  /**
   * FR-10-01: 매칭률이 "애매한" 구간이면 밀키트 CTA를 띄운다. 양 끝 포함.
   * 다 있으면 그냥 해먹으면 되고, 거의 없으면 밀키트로도 감당이 안 된다는
   * 가정이라 가운데 구간만 노린다.
   */
  mealKitCtaBand: { min: number; max: number };
  /** FR-09-01: 하루에 고정해서 보여줄 오늘의 추천 개수. */
  todayRecipeCount: number;
  /** FR-09-02: 온디맨드 목록의 기본/최대 길이. */
  listLimit: { default: number; max: number };
}

export const DEFAULT_MATCHING_CONFIG: MatchingConfig = {
  weights: { availability: 0.6, expiring: 0.4 },
  expiringTopN: 5,
  mealKitCtaBand: { min: 0.4, max: 0.7 },
  todayRecipeCount: 3,
  listLimit: { default: 50, max: 200 },
};
