// FR-13-01~03: 한 주치 순차(연쇄) 배치. M3의 핵심 로직이다.
//
// DB를 모르는 순수 함수로 둔 이유가 여기서는 특히 크다. 요일별 계산이 하나의
// 주간 상태(가상 재고 + 이미 쓴 레시피)를 공유하기 때문에, 중간 어딘가에서
// 상태가 어긋나면 결과는 "그럴듯한데 틀린" 식단표가 된다. 눈으로는 못 잡는
// 종류의 버그라, 입력을 전부 인자로 받아 값만으로 검증할 수 있어야 한다.

import { monthOf } from "@/lib/ingredients/seasonality";
import {
  DEFAULT_MEAL_PLAN_CONFIG,
  type MealPlanConfig,
} from "@/lib/meal-plan/config";
import { scoreForMealPlan, type MealPlanScore } from "@/lib/meal-plan/score";
import type { PlannedSlot } from "@/lib/meal-plan/slots";
import {
  DEFAULT_MATCHING_CONFIG,
  type MatchingConfig,
} from "@/lib/recipes/matching/config";
import {
  mainIngredientNames,
  selectExpiringNames,
  type ScorableRecipe,
} from "@/lib/recipes/matching/score";
import type { IngredientCategory, MealType } from "@/types/domain";

/** 가상 재고의 한 행. 이름만 있으면 매칭이 성립한다 (수량은 안 읽는다, FR-05-04). */
export interface VirtualInventoryEntry {
  normalizedName: string;
}

/** 재생성 때 보존할 칸 (사용자가 손댄 칸). */
export interface LockedSlot {
  recipeId: string;
  source: "auto" | "swapped" | "manual";
}

/** 배치가 끝난 한 칸. */
export interface PlacedSlot extends PlannedSlot {
  recipe: ScorableRecipe;
  score: MealPlanScore;
  source: "auto" | "swapped" | "manual";
  /**
   * 이 칸을 계산하기 **직전**의 가상 재고(재료명). 앞 요일이 쓴 재료가 실제로
   * 빠졌는지 눈으로 확인하려면 이 값이 필요하다 — 배치 결과만 봐서는
   * 연쇄 계산이 돌았는지 안 돌았는지 구분되지 않는다.
   */
  availableBefore: string[];
  /** 이 칸이 가상 재고에서 덜어낸 주재료. */
  consumed: string[];
}

/** `${date}|${mealType}` — 칸을 가리키는 키. DB의 unique 제약과 같은 축이다. */
export function slotKey(date: string, mealType: MealType): string {
  return `${date}|${mealType}`;
}

export interface PlaceWeekInput {
  /** buildWeekSlots의 결과. 시간순이어야 한다 (FR-13-01의 전제). */
  slots: readonly PlannedSlot[];
  /** 후보 레시피 풀. 재료까지 붙어 있어야 한다. */
  recipes: readonly ScorableRecipe[];
  /** FIFO(오래된 순) 정렬된 실재고. listInStockItems의 순서를 그대로 쓴다. */
  inventory: readonly VirtualInventoryEntry[];
  /** 최근 구매의 카테고리 비중 (FR-13-04). 비어 있으면 보너스는 중립값이 된다. */
  purchaseShares: ReadonlyMap<IngredientCategory, number>;
  /** 보존할 칸. slotKey → 고정할 레시피. */
  locked?: ReadonlyMap<string, LockedSlot>;
  config?: MealPlanConfig;
  matchingConfig?: MatchingConfig;
}

/**
 * 시간순으로 칸을 돌며 매번 **현재 가상 재고**로 점수를 다시 매기고 1위를 넣는다.
 *
 * 지키는 것:
 *   - FR-13-01 연쇄: 배치된 레시피가 쓴 보유 주재료를 가상 재고에서 덜어낸다.
 *     같은 재료를 여러 번 샀으면 FIFO상 가장 오래된 한 행만 덜어낸다 —
 *     요리함 체크리스트(buildCookChecklist)와 같은 규칙이라, 한 끼로 우유
 *     세 팩이 한꺼번에 사라지지 않는다.
 *   - FR-13-02 중복 금지: 같은 주에 같은 레시피를 두 번 넣지 않는다.
 *   - FR-13-03 빈 칸 없음: 점수가 0이어도 1위를 넣는다.
 *
 * 던지는 경우는 하나뿐이다 — 후보 레시피가 **아예 0개**일 때. 그때는 어떤 칸도
 * 채울 수 없어 FR-13-03을 지킬 방법이 없으므로, 조용히 빈 주를 만드는 대신
 * 호출부가 "레시피 수집이 안 됐다"고 말할 수 있게 알린다.
 */
export function placeWeek(input: PlaceWeekInput): PlacedSlot[] {
  const config = input.config ?? DEFAULT_MEAL_PLAN_CONFIG;
  const matchingConfig = input.matchingConfig ?? DEFAULT_MATCHING_CONFIG;
  const recipes = [...input.recipes];

  if (recipes.length === 0) {
    throw new Error("배치할 레시피가 없습니다");
  }

  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  // 주재료 목록은 칸마다 다시 뽑으면 낭비다 — 레시피당 한 번만 계산해 둔다.
  const mainsById = new Map(
    recipes.map((recipe) => [recipe.id, mainIngredientNames(recipe)]),
  );

  // 가상 재고. FIFO 순서를 유지해야 소진임박 TOP N이 매 칸마다 올바르게 갱신된다.
  const remaining = input.inventory.map((entry) => entry.normalizedName);
  const usedRecipeIds = new Set<string>();
  const placed: PlacedSlot[] = [];

  for (const slot of input.slots) {
    const ownedNames = new Set(remaining);
    const expiringNames = selectExpiringNames(
      remaining.map((normalizedName) => ({ normalizedName })),
      matchingConfig,
    );

    // FR-13-07: 제철은 칸마다 따로 본다. 한 주가 월말을 걸치면 월요일과
    // 일요일의 달이 다르고, 그 경계에서 제철이 바뀌는 재료가 실제로 있다.
    const month = monthOf(slot.date);

    const lock = input.locked?.get(slotKey(slot.date, slot.mealType));
    const lockedRecipe = lock ? byId.get(lock.recipeId) : undefined;

    // 고정된 레시피가 풀에 없으면(그 사이 삭제됐거나 후보 밖) 자동 배치로
    // 되돌린다. 칸을 비우는 것보다 낫다 (FR-13-03).
    const recipe =
      lockedRecipe ??
      pickBest(
        recipes,
        usedRecipeIds,
        ownedNames,
        expiringNames,
        input.purchaseShares,
        config,
        month,
      );

    const score = scoreForMealPlan(
      recipe,
      ownedNames,
      expiringNames,
      input.purchaseShares,
      config,
      month,
    );

    const consumed = consumeOwnedMains(
      remaining,
      mainsById.get(recipe.id) ?? mainIngredientNames(recipe),
    );

    usedRecipeIds.add(recipe.id);
    placed.push({
      ...slot,
      recipe,
      score,
      source: lockedRecipe ? (lock as LockedSlot).source : "auto",
      availableBefore: [...ownedNames],
      consumed,
    });
  }

  return placed;
}

/**
 * 아직 안 쓴 레시피 중 1위. 동점은 매칭률 → 이름 → id 순으로 끝까지 내려가
 * 결정적으로 가른다.
 *
 * 결정성이 중요한 이유: 재고가 비면 대부분의 후보가 같은 점수가 되는데,
 * 그때 순서가 흔들리면 새로고침할 때마다 식단표가 통째로 바뀐다.
 * (matching/score.ts의 rankRecipes가 같은 이유로 같은 규칙을 쓴다.)
 *
 * 후보가 고갈되면(레시피 수 < 칸 수) 중복 금지를 풀고 전체에서 고른다.
 * FR-13-02(중복 금지)와 FR-13-03(빈 칸 금지)이 부딪히는 유일한 지점이고,
 * "무엇을 먹을지가 정해져야 장보기로 이어진다"는 FR-13-03의 근거가 더 세다.
 */
function pickBest(
  recipes: readonly ScorableRecipe[],
  usedRecipeIds: ReadonlySet<string>,
  ownedNames: ReadonlySet<string>,
  expiringNames: ReadonlySet<string>,
  purchaseShares: ReadonlyMap<IngredientCategory, number>,
  config: MealPlanConfig,
  month: number,
): ScorableRecipe {
  const pool = recipes.filter((recipe) => !usedRecipeIds.has(recipe.id));
  const candidates = pool.length > 0 ? pool : recipes;

  let best: ScorableRecipe | null = null;
  let bestScore: MealPlanScore | null = null;

  for (const recipe of candidates) {
    const score = scoreForMealPlan(
      recipe,
      ownedNames,
      expiringNames,
      purchaseShares,
      config,
      month,
    );
    if (best === null || bestScore === null || isBetter(recipe, score, best, bestScore)) {
      best = recipe;
      bestScore = score;
    }
  }

  // candidates가 비어 있을 수 없으므로(placeWeek이 0개를 먼저 막는다) 여기서
  // best는 반드시 채워진다. 타입만 좁힌다.
  return best as ScorableRecipe;
}

function isBetter(
  recipe: ScorableRecipe,
  score: MealPlanScore,
  best: ScorableRecipe,
  bestScore: MealPlanScore,
): boolean {
  if (score.score !== bestScore.score) return score.score > bestScore.score;
  if (score.matchRate !== bestScore.matchRate) {
    return score.matchRate > bestScore.matchRate;
  }
  const byName = recipe.name.localeCompare(best.name, "ko");
  if (byName !== 0) return byName < 0;
  return recipe.id.localeCompare(best.id) < 0;
}

/**
 * 레시피가 쓴 주재료를 가상 재고에서 덜어낸다.
 * 재고에 없는 재료는 덜어낼 것도 없다 — 그건 장보기 후보로 남는다(FR-13-05).
 *
 * `remaining`을 제자리에서 고친다. FIFO 순서를 보존해야 다음 칸의 소진임박
 * TOP N이 맞게 나오기 때문에, 필터로 새 배열을 만들지 않고 splice로 한 행만 뺀다.
 */
function consumeOwnedMains(
  remaining: string[],
  mainNames: readonly string[],
): string[] {
  const consumed: string[] = [];
  for (const name of mainNames) {
    const index = remaining.indexOf(name);
    if (index === -1) continue;
    remaining.splice(index, 1);
    consumed.push(name);
  }
  return consumed;
}

/**
 * 이미 저장된 한 주를 **현재 재고**로 다시 훑어 매칭 정보를 새로 계산한다.
 *
 * 배치 결과(어떤 칸에 어떤 레시피)는 그대로 두고 "부족 재료·매칭률"만 갱신하는
 * 이유는 오늘의 추천(getOrCreateTodayRecipes)과 같다: 월요일에 짠 식단표를
 * 목요일에 열었을 때, 이미 요리해서 없어진 재료를 "보유"라고 우기면 재고 탭·
 * 요리함 체크리스트와 화면이 어긋난다.
 *
 * 연쇄 계산을 다시 도는 것도 같은 이유다. 월요일 저녁이 쓸 소고기는 화요일
 * 저녁 입장에서는 없는 셈이어야 장보기 후보가 맞게 나온다.
 */
export function replayWeek(
  entries: readonly {
    date: string;
    mealType: MealType;
    isHoliday: boolean;
    holidayName: string | null;
    recipeId: string;
    source: "auto" | "swapped" | "manual";
  }[],
  recipes: readonly ScorableRecipe[],
  inventory: readonly VirtualInventoryEntry[],
  purchaseShares: ReadonlyMap<IngredientCategory, number>,
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
  matchingConfig: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): PlacedSlot[] {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const remaining = inventory.map((entry) => entry.normalizedName);
  const placed: PlacedSlot[] = [];

  for (const entry of entries) {
    const recipe = byId.get(entry.recipeId);
    // 레시피가 지워졌으면 그 칸은 조용히 건너뛴다. 호출부가 다시 채운다.
    if (!recipe) continue;

    const ownedNames = new Set(remaining);
    const expiringNames = selectExpiringNames(
      remaining.map((normalizedName) => ({ normalizedName })),
      matchingConfig,
    );

    const score = scoreForMealPlan(
      recipe,
      ownedNames,
      expiringNames,
      purchaseShares,
      config,
      monthOf(entry.date),
    );
    const consumed = consumeOwnedMains(remaining, mainIngredientNames(recipe));

    placed.push({
      date: entry.date,
      mealType: entry.mealType,
      isHoliday: entry.isHoliday,
      holidayName: entry.holidayName,
      recipe,
      score,
      source: entry.source,
      availableBefore: [...ownedNames],
      consumed,
    });
  }

  return placed;
}
