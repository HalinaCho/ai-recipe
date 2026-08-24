// FR-08: 매칭 스코어링. DB도 요청도 모르는 순수 함수만 둔다 —
// 점수 공식은 실사용 후 튜닝 대상이라 테스트로 고정해 두고 싶기 때문이다.

import { DEFAULT_MATCHING_CONFIG, type MatchingConfig } from "@/lib/recipes/matching/config";
import { isWhitelistedSeasoning } from "@/lib/recipes/seasonings";
import type { RecipeListItem, RecipeMatch } from "@/types/api";

/** 점수 계산에 필요한 만큼만 추린 레시피. DB 행에서든 픽스처에서든 만들 수 있다. */
export interface ScorableRecipe {
  id: string;
  name: string;
  imageUrl: string | null;
  calories: number | null;
  /**
   * FR-13-06: 소스가 매긴 요리종류 원문 (식약처 RCP_PAT2). 레시피 탭이
   * "후식" 배지를 붙이는 근거이자, 식단표·오늘의 추천이 간식을 빼는 기준이다.
   * 아직 백필되지 않은 행이 있어 optional로 둔다.
   */
  category?: string | null;
  ingredients: {
    normalizedName: string;
    role: "main" | "seasoning";
    isWhitelistedSeasoning: boolean;
  }[];
}

/** 소진임박 판정에 쓰는 재고 최소 형태. 이미 FIFO 정렬되어 있다고 본다. */
export interface FifoInventoryEntry {
  normalizedName: string;
}

/**
 * 매칭 계산에 들어가는 주재료 이름. 조미료는 두 가지 방법으로 걸러낸다:
 * 수집 시점 LLM이 붙인 role과, 런타임 화이트리스트(FR-07-02). 둘 중 하나만
 * 걸려도 제외 — 분류가 틀려서 간장이 주재료로 올라와도 매칭률이 망가지지
 * 않게 하려는 것이다.
 *
 * 같은 이름이 두 번 적힌 레시피는 한 번으로 센다. 분모가 부풀면 다 가진
 * 레시피도 매칭률 1에 못 닿는다.
 */
export function mainIngredientNames(recipe: ScorableRecipe): string[] {
  const seen = new Set<string>();
  for (const ingredient of recipe.ingredients) {
    if (ingredient.role !== "main") continue;
    if (ingredient.isWhitelistedSeasoning) continue;
    if (isWhitelistedSeasoning(ingredient.normalizedName)) continue;
    seen.add(ingredient.normalizedName);
  }
  return [...seen];
}

/**
 * FR-04-02 + FR-08-01: FIFO로 가장 오래된 재고에서 소진임박 TOP N을 뽑는다.
 *
 * 행이 아니라 **재료명** 기준으로 N개를 센다. 우유를 세 번 샀다고 해서 TOP N
 * 자리를 우유가 세 칸 먹으면, 정작 추천에 쓸 다른 임박 재료가 밀려난다.
 */
export function selectExpiringNames(
  fifoOrderedInventory: FifoInventoryEntry[],
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Set<string> {
  const names = new Set<string>();
  for (const item of fifoOrderedInventory) {
    if (names.size >= config.expiringTopN) break;
    names.add(item.normalizedName);
  }
  return names;
}

/** 신호가 없을 때 기본값으로 쓰는 빈 집합. 매 호출마다 새로 만들지 않는다. */
const EMPTY_NAMES: ReadonlySet<string> = new Set();

/**
 * 추천 V2 Level 1: 취향 신호(퀴즈·북마크·요리 이력)가 하나도 없는 가구는
 * preference 항을 0으로 두고, 그 몫을 availability·expiring에 **비례
 * 재배분**한다 — 신호가 없다고 그 가구의 추천이 손해를 봐서는 안 된다
 * (합은 항상 1을 유지). 신호가 있으면 config 그대로 쓴다.
 *
 * preference가 이미 0인 config(예: 옛 2항 공식을 흉내 낸 테스트/설정)는
 * 재배분해도 결과가 그대로다 — remaining으로 나눈 몫에 0을 곱하기 때문.
 */
export function resolveWeights(
  config: MatchingConfig,
  hasPreferenceSignal: boolean,
): MatchingConfig["weights"] {
  const { availability, expiring, preference = 0 } = config.weights;
  if (hasPreferenceSignal || preference === 0) {
    return { availability, expiring, preference };
  }
  const remaining = availability + expiring;
  if (remaining <= 0) return { availability, expiring, preference };
  return {
    availability: availability + preference * (availability / remaining),
    expiring: expiring + preference * (expiring / remaining),
    preference: 0,
  };
}

/**
 * FR-08-01의 공식:
 *   score = 보유 주재료 비율 × w.availability
 *         + 주재료 중 소진임박 TOP N 포함 비율 × w.expiring
 *         + 선호 재료 겹침(부호 있음) × w.preference   (V2 Level 1)
 *
 * 주재료가 하나도 없는 레시피(조미료만 적혔거나 수집이 덜 된 행)는 0점이다.
 * 0/0을 1로 봐서 "완벽 매칭"으로 올려버리면, 데이터가 부실한 레시피가
 * 추천 최상단을 차지한다.
 *
 * preferredNames·dislikedNames는 취향 퀴즈(좋아요/싫어요)·북마크·요리 이력에서
 * 모은 "재료" 집합이다(레시피 단위가 아니라 재료 단위로 일반화 — 카레를
 * 좋아하면 다른 카레류도 가산점을 받는다). 두 집합 모두 비어 있으면 이
 * 가구는 아직 취향 신호가 없는 것으로 보고 `resolveWeights`가 가중치를
 * 재배분한다.
 */
export function scoreRecipe(
  recipe: ScorableRecipe,
  ownedNames: ReadonlySet<string>,
  expiringNames: ReadonlySet<string>,
  preferredNames: ReadonlySet<string> = EMPTY_NAMES,
  dislikedNames: ReadonlySet<string> = EMPTY_NAMES,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): RecipeMatch {
  const mainNames = mainIngredientNames(recipe);

  const owned: string[] = [];
  const missing: string[] = [];
  const expiring: string[] = [];

  for (const name of mainNames) {
    if (ownedNames.has(name)) {
      owned.push(name);
      // 소진임박은 재고에서 뽑은 목록이라 보유 재료 중에서만 나온다.
      if (expiringNames.has(name)) expiring.push(name);
    } else {
      missing.push(name);
    }
  }

  if (mainNames.length === 0) {
    return {
      score: 0,
      matchRate: 0,
      ownedMainIngredients: [],
      missingMainIngredients: [],
      usesExpiringIngredients: [],
    };
  }

  const matchRate = owned.length / mainNames.length;
  const expiringRate = expiring.length / mainNames.length;

  const hasPreferenceSignal = preferredNames.size > 0 || dislikedNames.size > 0;
  const preferredCount = mainNames.filter((name) =>
    preferredNames.has(name),
  ).length;
  const dislikedCount = mainNames.filter((name) =>
    dislikedNames.has(name),
  ).length;
  // -1~1: 싫어하는 재료 겹침이 좋아하는 재료 겹침을 그대로 상쇄한다.
  const preferenceRate = (preferredCount - dislikedCount) / mainNames.length;

  const weights = resolveWeights(config, hasPreferenceSignal);

  return {
    // 싫어요가 강하게 몰리면 이론상 음수가 나올 수 있다 — 화면은 매칭률을
    // %로 그리므로 0 밑으로는 내려가지 않게 자른다.
    score: Math.max(
      0,
      matchRate * weights.availability +
        expiringRate * weights.expiring +
        preferenceRate * weights.preference,
    ),
    matchRate,
    ownedMainIngredients: owned,
    missingMainIngredients: missing,
    usesExpiringIngredients: expiring,
  };
}

/**
 * FR-10-01: 애매한 구간에만 "밀키트로 간편하게" CTA. 판단은 서버가 하고
 * 화면은 결과만 쓴다. 기준은 점수가 아니라 매칭률이다 — 사용자가 체감하는
 * "재료가 반쯤 있다"는 감각이 매칭률이고, 점수에는 소진임박 항이 섞여 있어
 * 같은 재료 상황에서도 값이 흔들리기 때문이다.
 */
export function showsMealKitCta(
  match: RecipeMatch,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): boolean {
  const { min, max } = config.mealKitCtaBand;
  return match.matchRate >= min && match.matchRate <= max;
}

export function toListItem(
  recipe: ScorableRecipe,
  match: RecipeMatch,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): RecipeListItem {
  return {
    id: recipe.id,
    name: recipe.name,
    imageUrl: recipe.imageUrl,
    calories: recipe.calories,
    category: recipe.category ?? null,
    match,
    showMealKitCta: showsMealKitCta(match, config),
  };
}

/**
 * FR-08-02: 부분 매칭도 버리지 않고 전부 점수 순으로 세운다.
 *
 * 동점 처리를 이름까지 내려가며 못 박는 이유: 오늘의 추천은 하루 고정이고
 * (FR-09-01) 목록도 새로고침마다 순서가 바뀌면 안 되는데, 재고가 비면 전부
 * 0점 동점이 되기 때문이다.
 */
export function rankRecipes(
  recipes: ScorableRecipe[],
  ownedNames: ReadonlySet<string>,
  expiringNames: ReadonlySet<string>,
  preferredNames: ReadonlySet<string> = EMPTY_NAMES,
  dislikedNames: ReadonlySet<string> = EMPTY_NAMES,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): RecipeListItem[] {
  return recipes
    .map((recipe) =>
      toListItem(
        recipe,
        scoreRecipe(
          recipe,
          ownedNames,
          expiringNames,
          preferredNames,
          dislikedNames,
          config,
        ),
        config,
      ),
    )
    .sort(
      (a, b) =>
        b.match.score - a.match.score ||
        b.match.matchRate - a.match.matchRate ||
        a.name.localeCompare(b.name, "ko") ||
        a.id.localeCompare(b.id),
    );
}
