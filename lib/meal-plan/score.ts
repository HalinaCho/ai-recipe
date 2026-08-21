// FR-13-04: 식단표 배치용 스코어링.
//
//   score = 매칭률 × w.matchRate
//         + 소진임박 비율 × w.expiring
//         + 카테고리 다양성 보너스 × w.diversity
//
// M2의 매칭 점수(lib/recipes/matching/score.ts)와 **분리된 함수**인 이유는
// 세 번째 항 때문이다. 목록 추천은 "지금 뭘 해먹지"라 보유율이 거의 전부지만,
// 식단표는 어차피 장을 봐야 하는 일주일치라 "같은 재료만 반복되지 않게"가
// 필요하다. 대신 주재료를 추리는 규칙(mainIngredientNames)은 그대로 재사용한다 —
// 조미료를 분모에서 빼는 기준이 화면마다 달라지면 안 된다.

import { categoryShares, resolveCategory } from "@/lib/ingredients/category";
import {
  outOfSeasonPurchases,
  seasonPenaltyFactor,
} from "@/lib/ingredients/seasonality";
import { daysSincePurchase, todayInSeoul } from "@/lib/inventory/queries";
import {
  DEFAULT_MEAL_PLAN_CONFIG,
  type MealPlanConfig,
} from "@/lib/meal-plan/config";
import {
  DEFAULT_MATCHING_CONFIG,
  type MatchingConfig,
} from "@/lib/recipes/matching/config";
import {
  mainIngredientNames,
  type ScorableRecipe,
} from "@/lib/recipes/matching/score";
import type { RecipeMatch } from "@/types/api";
import type { IngredientCategory } from "@/types/domain";

/**
 * 구매 이력이 없을 때 모든 레시피에 똑같이 주는 다양성 값.
 *
 * 0이 아니라 중립값인 이유: 이력이 없다는 것은 **우리가 모른다**는 뜻이지
 * 어떤 레시피가 나쁘다는 뜻이 아니다. 0을 주든 0.5를 주든 전부 같은 값이면
 * 순위는 안 바뀌지만, 0.5로 두면 "이력이 쌓이면 이 값에서 위아래로 갈린다"는
 * 의미가 점수에 그대로 보인다.
 */
export const NEUTRAL_DIVERSITY_BONUS = 0.5;

/** FR-13-04 공식의 결과. 세 항을 따로 남겨 두어야 왜 이 레시피가 뽑혔는지 설명된다. */
export interface MealPlanScore {
  /** 0~1. 세 항의 가중합. */
  score: number;
  matchRate: number;
  expiringRate: number;
  diversityBonus: number;
  /**
   * FR-13-07 제철 감점 계수 (0~1). 1이면 감점 없음. 세 항의 합에 곱해진다.
   * 따로 남기는 이유는 "왜 이 레시피가 밀렸는지"를 화면과 로그가 설명할 수
   * 있어야 하기 때문이다.
   */
  seasonFactor: number;
  /** 사야 하는데 지금 제철이 아닌 주재료. 보유 중인 재료는 여기 안 들어온다. */
  outOfSeasonIngredients: string[];
  ownedMainIngredients: string[];
  /** FR-13-05 장보기 후보. */
  missingMainIngredients: string[];
  usesExpiringIngredients: string[];
}

/** 다양성 보너스를 만드는 데 필요한 구매 이력 최소 형태. */
export interface PurchaseHistoryEntry {
  normalizedName: string;
  /** YYYY-MM-DD. */
  purchasedAt: string;
}

/**
 * 최근 `purchaseHistoryDays`일치 구매의 카테고리 비중 (FR-13-04의 "최근 4주").
 *
 * 소진된 항목도 센다 — 다 먹어치운 고기야말로 "최근에 고기를 많이 샀다"는
 * 증거다. 재고에 남아 있는 것만 세면 오래 안 쓴 재료 쪽으로 비중이 쏠린다.
 */
export function purchaseCategoryShares(
  history: readonly PurchaseHistoryEntry[],
  referenceDate: string = todayInSeoul(),
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
): Map<IngredientCategory, number> {
  const recent = history
    .filter(
      (entry) =>
        daysSincePurchase(entry.purchasedAt, referenceDate) <=
        config.purchaseHistoryDays,
    )
    .map((entry) => entry.normalizedName);

  return categoryShares(recent, config.diversityCategories);
}

/**
 * 레시피 주재료가 속한 카테고리의 "최근 구매 비중"이 **낮을수록** 높은 점수.
 * 주재료마다 (1 - 비중)을 구해 평균낸다.
 *
 * 평균을 쓰는 이유: 합계로 하면 재료 수가 많은 레시피가 무조건 유리해진다.
 * 비중은 0~1이라 (1 - 비중)도 0~1이고, 평균도 0~1을 벗어나지 않는다.
 *
 * 두 가지 "모름"을 다르게 다룬다:
 *   - 구매 이력이 없다 → 우리가 모르는 것이므로 모든 레시피에 중립값.
 *   - 레시피에 주재료가 없다 → 그 레시피만의 데이터 부실이므로 0.
 *     (matching/score.ts가 0/0을 1로 안 보는 것과 같은 이유 — 수집이 덜 된
 *      레시피가 보너스를 공짜로 받아 상위를 차지하면 안 된다.)
 */
export function diversityBonus(
  recipe: ScorableRecipe,
  purchaseShares: ReadonlyMap<IngredientCategory, number>,
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
): number {
  if (purchaseShares.size === 0) return NEUTRAL_DIVERSITY_BONUS;

  const countable = new Set(config.diversityCategories);
  const names = mainIngredientNames(recipe).filter((name) =>
    countable.has(resolveCategory(name)),
  );
  if (names.length === 0) return 0;

  let total = 0;
  for (const name of names) {
    const share = purchaseShares.get(resolveCategory(name)) ?? 0;
    total += 1 - clamp01(share);
  }
  return clamp01(total / names.length);
}

/**
 * 한 칸에 대한 점수. `ownedNames`·`expiringNames`는 **그 시점의 가상 재고**다
 * (FR-13-01 — 앞선 요일이 쓴 재료는 이미 빠져 있다).
 */
export function scoreForMealPlan(
  recipe: ScorableRecipe,
  ownedNames: ReadonlySet<string>,
  expiringNames: ReadonlySet<string>,
  purchaseShares: ReadonlyMap<IngredientCategory, number>,
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
  /**
   * FR-13-07: 이 칸이 놓인 달 (1~12). 제철 감점에 쓴다.
   * 넘기지 않으면 감점이 없다 — 달을 모르는 호출부(테스트·다른 화면)가
   * 조용히 엉뚱한 달로 감점당하는 것보다 감점을 안 하는 쪽이 안전하다.
   */
  month?: number,
): MealPlanScore {
  const mainNames = mainIngredientNames(recipe);

  const owned: string[] = [];
  const missing: string[] = [];
  const expiring: string[] = [];

  for (const name of mainNames) {
    if (ownedNames.has(name)) {
      owned.push(name);
      if (expiringNames.has(name)) expiring.push(name);
    } else {
      missing.push(name);
    }
  }

  const matchRate = mainNames.length === 0 ? 0 : owned.length / mainNames.length;
  const expiringRate =
    mainNames.length === 0 ? 0 : expiring.length / mainNames.length;
  const diversity = diversityBonus(recipe, purchaseShares, config);

  // 가중치는 튜닝 대상이라 합이 1이 아닌 값이 들어올 수 있다. 점수가 1을
  // 넘거나 음수가 되면 화면(막대·퍼센트)이 깨지므로 여기서 0~1로 자른다.
  const base = clamp01(
    matchRate * config.weights.matchRate +
      expiringRate * config.weights.expiring +
      diversity * config.weights.diversity,
  );

  // FR-13-07: 제철 감점은 세 항의 **가중합에 곱한다**. 네 번째 항으로 더하지
  // 않는 이유가 있다 — 더하기로 넣으면 다른 항이 높은 레시피가 감점을 흡수해
  // 8월 감귤이 여전히 상위에 남는다. 곱셈이면 아무리 좋은 레시피여도 제철이
  // 아닌 재료를 사야 하는 만큼 확실히 내려간다.
  //
  // 제철이 아닌 **보유** 재료는 감점 대상이 아니다 (outOfSeasonPurchases 참고).
  const seasonFactor =
    month === undefined
      ? 1
      : seasonPenaltyFactor(mainNames, missing, month, config.seasonPenalty);
  const outOfSeason =
    month === undefined ? [] : outOfSeasonPurchases(missing, month);

  return {
    score: clamp01(base * seasonFactor),
    matchRate,
    expiringRate,
    diversityBonus: diversity,
    seasonFactor,
    outOfSeasonIngredients: outOfSeason,
    ownedMainIngredients: owned,
    missingMainIngredients: missing,
    usesExpiringIngredients: expiring,
  };
}

/**
 * 식단표 점수를 목록 화면이 쓰는 `RecipeMatch`로 옮긴다.
 *
 * `score`만 M2 공식(matching/config.ts의 두 항)으로 다시 만든다. 식단표 칸에
 * 박히는 `RecipeListItem`은 레시피 탭·오늘의 추천과 같은 부품이라, 거기서
 * `match.score`가 갑자기 다른 공식의 값이면 밀키트 CTA 같은 파생 판단까지
 * 같이 어긋난다. 3항 공식의 값은 `MealPlanSlot.matchScore`로 따로 나간다.
 *
 * 두 항을 다시 곱해 쓰는 이유는 scoreRecipe를 한 번 더 호출하지 않기
 * 위해서다 — 비율(matchRate·expiringRate)은 이미 같은 가상 재고 위에서
 * 계산돼 있어 결과가 완전히 같다.
 */
export function toRecipeMatch(
  score: MealPlanScore,
  matchingConfig: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): RecipeMatch {
  return {
    score:
      score.matchRate * matchingConfig.weights.availability +
      score.expiringRate * matchingConfig.weights.expiring,
    matchRate: score.matchRate,
    ownedMainIngredients: score.ownedMainIngredients,
    missingMainIngredients: score.missingMainIngredients,
    usesExpiringIngredients: score.usesExpiringIngredients,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
