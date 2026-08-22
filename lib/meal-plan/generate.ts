// FR-13-01~03·FR-13-08: 한 주치 순차(연쇄) 배치. M3의 핵심 로직이다.
//
// DB를 모르는 순수 함수로 둔 이유가 여기서는 특히 크다. 요리별 계산이 하나의
// 주간 상태(가상 재고 + 이미 쓴 레시피)를 공유하기 때문에, 중간 어딘가에서
// 상태가 어긋나면 결과는 "그럴듯한데 틀린" 식단표가 된다. 눈으로는 못 잡는
// 종류의 버그라, 입력을 전부 인자로 받아 값만으로 검증할 수 있어야 한다.
//
// FR-13-08부터 한 끼니가 요리 여러 개다. 연쇄는 **요리 단위**로 흐른다 —
// 같은 끼니 안에서도 국이 쓴 두부는 그 뒤 반찬 입장에서 이미 없는 셈이다.

import { monthOf } from "@/lib/ingredients/seasonality";
import {
  DEFAULT_MEAL_PLAN_CONFIG,
  type MealPlanConfig,
} from "@/lib/meal-plan/config";
import { dishRoleOf, remainingRoles } from "@/lib/meal-plan/composition";
import {
  pickConvenienceSlots,
  type ConvenienceItem,
} from "@/lib/meal-plan/convenience";
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
import type {
  IngredientCategory,
  MealPlanDishRole,
  MealType,
} from "@/types/domain";

/** 가상 재고의 한 행. 이름만 있으면 매칭이 성립한다 (수량은 안 읽는다, FR-05-04). */
export interface VirtualInventoryEntry {
  normalizedName: string;
}

/** 재생성 때 보존할 요리 (사용자가 손댄 것). */
export interface LockedDish {
  recipeId: string;
  role: MealPlanDishRole;
  source: "auto" | "swapped" | "manual";
}

/** 배치가 끝난 요리 하나. meal_plan_entry 한 행에 대응한다. */
export interface PlacedDish extends PlannedSlot {
  role: MealPlanDishRole;
  /** 간편식이면 null — 레시피가 아니라 장바구니 후보다 (FR-13-10). */
  recipe: ScorableRecipe | null;
  /** 간편식일 때만 채워진다. */
  convenience: ConvenienceItem | null;
  score: MealPlanScore;
  source: "auto" | "swapped" | "manual";
  /**
   * 이 요리를 계산하기 **직전**의 가상 재고(재료명). 앞 요리가 쓴 재료가 실제로
   * 빠졌는지 눈으로 확인하려면 이 값이 필요하다 — 배치 결과만 봐서는
   * 연쇄 계산이 돌았는지 안 돌았는지 구분되지 않는다.
   */
  availableBefore: string[];
  /** 이 요리가 가상 재고에서 덜어낸 주재료. */
  consumed: string[];
}

/**
 * 간편식 자리의 점수. 재료를 안 쓰므로 매칭이랄 게 없다.
 *
 * 0으로 두는 게 맞는 이유: 화면의 매칭 막대는 "우리 재고로 얼마나 되는가"를
 * 말하는데 간편식은 사 오는 것이라 그 축에 없다. 억지로 100%를 주면
 * "있는 재료로 만들 수 있다"는 뜻이 되어 거짓말이 된다. 화면은 간편식일 때
 * 막대 대신 다른 표시를 쓴다.
 */
const EMPTY_SCORE: MealPlanScore = {
  score: 0,
  matchRate: 0,
  expiringRate: 0,
  diversityBonus: 0,
  seasonFactor: 1,
  repeatFactor: 1,
  outOfSeasonIngredients: [],
  ownedMainIngredients: [],
  missingMainIngredients: [],
  usesExpiringIngredients: [],
};

/** `${date}|${mealType}` — 끼니를 가리키는 키. */
export function slotKey(date: string, mealType: MealType): string {
  return `${date}|${mealType}`;
}

export interface PlaceWeekInput {
  /** buildWeekSlots의 결과. 시간순이어야 한다 (FR-13-01의 전제). */
  slots: readonly PlannedSlot[];
  /** 후보 레시피 풀. 재료와 분류까지 붙어 있어야 한다. */
  recipes: readonly ScorableRecipe[];
  /** FIFO(오래된 순) 정렬된 실재고. listInStockItems의 순서를 그대로 쓴다. */
  inventory: readonly VirtualInventoryEntry[];
  /** 최근 구매의 카테고리 비중 (FR-13-04). 비어 있으면 보너스는 중립값이 된다. */
  purchaseShares: ReadonlyMap<IngredientCategory, number>;
  /** 보존할 요리들. slotKey → 그 끼니에서 유지할 요리 목록. */
  locked?: ReadonlyMap<string, readonly LockedDish[]>;
  /** FR-13-10: 간편식을 어느 끼니에 넣을지 정하는 씨앗. 주차를 넣는다. */
  weekSeed?: number;
  config?: MealPlanConfig;
  matchingConfig?: MatchingConfig;
}

/**
 * 시간순으로 끼니를 돌며 매번 **현재 가상 재고**로 점수를 다시 매기고 상을 차린다.
 *
 * 지키는 것:
 *   - FR-13-01 연쇄: 배치된 요리가 쓴 보유 주재료를 가상 재고에서 덜어낸다.
 *     같은 재료를 여러 번 샀으면 FIFO상 가장 오래된 한 행만 덜어낸다 —
 *     한 끼로 우유 세 팩이 한꺼번에 사라지지 않는다.
 *   - FR-13-02 중복 금지: 같은 주에 같은 레시피를 두 번 넣지 않는다.
 *   - FR-13-03 빈 칸 없음: 점수가 0이어도 넣는다.
 *   - FR-13-08 상차림: 일품이면 단독, 아니면 국 하나에 반찬을 붙인다.
 *
 * 던지는 경우는 하나뿐이다 — 후보 레시피가 **아예 0개**일 때.
 */
export function placeWeek(input: PlaceWeekInput): PlacedDish[] {
  const config = input.config ?? DEFAULT_MEAL_PLAN_CONFIG;
  const matchingConfig = input.matchingConfig ?? DEFAULT_MATCHING_CONFIG;
  const recipes = [...input.recipes];

  if (recipes.length === 0) {
    throw new Error("배치할 레시피가 없습니다");
  }

  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  // 주재료 목록은 요리마다 다시 뽑으면 낭비다 — 레시피당 한 번만 계산해 둔다.
  const mainsById = new Map(
    recipes.map((recipe) => [recipe.id, mainIngredientNames(recipe)]),
  );

  // 가상 재고. FIFO 순서를 유지해야 소진임박 TOP N이 매번 올바르게 갱신된다.
  const remaining = input.inventory.map((entry) => entry.normalizedName);
  const usedRecipeIds = new Set<string>();
  const placed: PlacedDish[] = [];
  // FR-13-09: 이번 주에 각 재료가 몇 번 쓰였는지. 보유 여부와 무관하게
  // **레시피가 요구한 횟수**를 센다 — 없어서 못 쓴 재료도 계속 장보기 목록에
  // 오르면 쏠리는 건 마찬가지다.
  const usageCounts = new Map<string, number>();
  const mainsOf = (recipe: ScorableRecipe) =>
    mainsById.get(recipe.id) ?? mainIngredientNames(recipe);

  // FR-13-10: 간편식을 넣을 끼니를 미리 정한다. 고르게 흩뿌려야 "요리 안 하는
  // 주"로 보이지 않고, 같은 국을 이틀 연속 먹는 일도 없다.
  const conveniencePicks = pickConvenienceSlots(
    input.slots.length,
    config.convenienceMealsPerWeek,
    input.weekSeed ?? 0,
  );

  for (const [slotIndex, slot] of input.slots.entries()) {
    // FR-13-07: 제철은 끼니마다 따로 본다. 한 주가 월말을 걸치면 월요일과
    // 일요일의 달이 다르고, 그 경계에서 제철이 바뀌는 재료가 실제로 있다.
    const month = monthOf(slot.date);
    const lockedDishes = input.locked?.get(slotKey(slot.date, slot.mealType));

    const emit = (
      recipe: ScorableRecipe,
      role: MealPlanDishRole,
      source: "auto" | "swapped" | "manual",
    ) => {
      const ownedNames = new Set(remaining);
      const expiringNames = selectExpiringNames(
        remaining.map((normalizedName) => ({ normalizedName })),
        matchingConfig,
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
      for (const name of mainsById.get(recipe.id) ?? []) {
        usageCounts.set(name, (usageCounts.get(name) ?? 0) + 1);
      }
      placed.push({
        ...slot,
        role,
        recipe,
        convenience: null,
        score,
        source,
        availableBefore: [...ownedNames],
        consumed,
      });
    };

    // 간편식은 재료를 쓰지 않는다 — 사서 데우기만 하므로 가상 재고도 그대로다.
    const emitConvenience = (item: ConvenienceItem) => {
      placed.push({
        ...slot,
        role: "convenience",
        recipe: null,
        convenience: item,
        score: EMPTY_SCORE,
        source: "auto",
        availableBefore: [...new Set(remaining)],
        consumed: [],
      });
    };

    // 사용자가 손댄 요리를 먼저 되살린다. 풀에서 사라진 레시피는 건너뛰고
    // 자동 배치가 그 자리를 메운다 — 칸을 비우는 것보다 낫다 (FR-13-03).
    const restoredRoles: MealPlanDishRole[] = [];
    for (const lock of lockedDishes ?? []) {
      const recipe = byId.get(lock.recipeId);
      if (!recipe || usedRecipeIds.has(recipe.id)) continue;
      emit(recipe, lock.role, lock.source);
      restoredRoles.push(lock.role);
    }

    // 남은 자리를 채운다. 보존된 요리가 하나도 없으면 첫 요리를 먼저 골라
    // 그 분류에 따라 상차림을 정한다.
    // FR-13-10: 이 끼니가 간편식 자리면 국 대신 간편식을 놓고 반찬만 붙인다.
    // 국을 사두면 반찬만 만들면 되는 실제 저녁 모습이다.
    const convenience = conveniencePicks.get(slotIndex);
    if (convenience && restoredRoles.length === 0) {
      emitConvenience(convenience);
      for (const role of Array<MealPlanDishRole>(config.sidesPerMeal).fill(
        "side",
      )) {
        const side = pickBestForRole(
          recipes,
          usedRecipeIds,
          remaining,
          input.purchaseShares,
          config,
          matchingConfig,
          month,
          role,
          usageCounts,
          mainsOf,
        );
        if (!side) continue;
        emit(side, role, "auto");
      }
      continue;
    }

    let roles: MealPlanDishRole[];
    if (restoredRoles.length === 0) {
      const first = pickBestAny(
        recipes,
        usedRecipeIds,
        remaining,
        input.purchaseShares,
        config,
        matchingConfig,
        month,
        usageCounts,
        mainsOf,
      );
      const firstRole = dishRoleOf(first.category);
      emit(first, firstRole, "auto");
      roles = remainingRoles(firstRole, config.sidesPerMeal);
    } else {
      // 보존된 요리가 있으면 그 구성을 기준으로 모자란 자리만 채운다.
      const plan = [restoredRoles[0], ...remainingRoles(restoredRoles[0], config.sidesPerMeal)];
      roles = plan.slice(restoredRoles.length);
    }

    for (const role of roles) {
      const recipe = pickBestForRole(
        recipes,
        usedRecipeIds,
        remaining,
        input.purchaseShares,
        config,
        matchingConfig,
        month,
        role,
        usageCounts,
        mainsOf,
      );
      // 그 자리에 맞는 후보가 아예 없으면 그 자리는 비운다. 국이 없다고
      // 반찬까지 못 놓는 것보다, 있는 만큼 차리는 편이 낫다.
      if (!recipe) continue;
      emit(recipe, role, "auto");
    }
  }

  return placed;
}

/**
 * 자리를 가리지 않고 1위. 첫 요리를 고를 때 쓴다 — 그 분류가 상차림 구성을 정한다.
 *
 * 후보가 고갈되면 중복 금지를 풀고 전체에서 고른다. FR-13-02(중복 금지)와
 * FR-13-03(빈 칸 금지)이 부딪히는 유일한 지점이고, "무엇을 먹을지가 정해져야
 * 장보기로 이어진다"는 FR-13-03의 근거가 더 세다.
 */
function pickBestAny(
  recipes: readonly ScorableRecipe[],
  usedRecipeIds: ReadonlySet<string>,
  remaining: readonly string[],
  purchaseShares: ReadonlyMap<IngredientCategory, number>,
  config: MealPlanConfig,
  matchingConfig: MatchingConfig,
  month: number,
  usageCounts: ReadonlyMap<string, number>,
  mainsOf: (recipe: ScorableRecipe) => readonly string[],
): ScorableRecipe {
  const unused = recipes.filter((recipe) => !usedRecipeIds.has(recipe.id));
  const best = best1(
    unused.length > 0 ? unused : recipes,
    remaining,
    purchaseShares,
    config,
    matchingConfig,
    month,
    usageCounts,
    mainsOf,
  );
  // recipes가 비어 있지 않음은 placeWeek이 먼저 확인한다.
  return best as ScorableRecipe;
}

/** 그 자리(국·반찬)에 맞는 후보 중 1위. 없으면 null — 그 자리는 비운다. */
function pickBestForRole(
  recipes: readonly ScorableRecipe[],
  usedRecipeIds: ReadonlySet<string>,
  remaining: readonly string[],
  purchaseShares: ReadonlyMap<IngredientCategory, number>,
  config: MealPlanConfig,
  matchingConfig: MatchingConfig,
  month: number,
  role: MealPlanDishRole,
  usageCounts: ReadonlyMap<string, number>,
  mainsOf: (recipe: ScorableRecipe) => readonly string[],
): ScorableRecipe | null {
  const candidates = recipes.filter(
    (recipe) =>
      !usedRecipeIds.has(recipe.id) && dishRoleOf(recipe.category) === role,
  );
  if (candidates.length === 0) return null;
  return best1(
    candidates,
    remaining,
    purchaseShares,
    config,
    matchingConfig,
    month,
    usageCounts,
    mainsOf,
  );
}

/**
 * 후보 중 1위. 동점은 매칭률 → 이름 → id 순으로 끝까지 내려가 결정적으로 가른다.
 *
 * 결정성이 중요한 이유: 재고가 비면 대부분의 후보가 같은 점수가 되는데,
 * 그때 순서가 흔들리면 새로고침할 때마다 식단표가 통째로 바뀐다.
 */
function best1(
  candidates: readonly ScorableRecipe[],
  remaining: readonly string[],
  purchaseShares: ReadonlyMap<IngredientCategory, number>,
  config: MealPlanConfig,
  matchingConfig: MatchingConfig,
  month: number,
  usageCounts: ReadonlyMap<string, number>,
  mainsOf: (recipe: ScorableRecipe) => readonly string[],
): ScorableRecipe | null {
  if (candidates.length === 0) return null;

  const ownedNames = new Set(remaining);
  const expiringNames = selectExpiringNames(
    remaining.map((normalizedName) => ({ normalizedName })),
    matchingConfig,
  );

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
      usageCounts,
    );
    if (
      best === null ||
      bestScore === null ||
      isBetter(recipe, score, best, bestScore, usageCounts, mainsOf)
    ) {
      best = recipe;
      bestScore = score;
    }
  }

  return best;
}

/**
 * 이번 주에 이 레시피의 주재료가 이미 몇 번 쓰였는지 (합).
 * 낮을수록 새로운 재료를 쓰는 요리다.
 */
function usageLoad(
  recipe: ScorableRecipe,
  usageCounts: ReadonlyMap<string, number>,
  mainsOf: (recipe: ScorableRecipe) => readonly string[],
): number {
  let total = 0;
  for (const name of mainsOf(recipe)) total += usageCounts.get(name) ?? 0;
  return total;
}

function isBetter(
  recipe: ScorableRecipe,
  score: MealPlanScore,
  best: ScorableRecipe,
  bestScore: MealPlanScore,
  usageCounts: ReadonlyMap<string, number>,
  mainsOf: (recipe: ScorableRecipe) => readonly string[],
): boolean {
  if (score.score !== bestScore.score) return score.score > bestScore.score;
  if (score.matchRate !== bestScore.matchRate) {
    return score.matchRate > bestScore.matchRate;
  }

  // FR-13-09: 여기가 쏠림을 실제로 푸는 자리다.
  //
  // 곱셈 감점(repeatPenaltyFactor)은 **점수가 0일 때 아무 일도 하지 않는다** —
  // 0에 무엇을 곱해도 0이다. 그런데 재료가 바닥난 뒤쪽 끼니는 후보가 전부
  // 0점이라, 정작 분산이 가장 필요한 구간에서 감점이 안 듣는다. 그 구간의
  // 순서는 전적으로 동점 처리가 정하므로, 덜 쓴 재료를 여기서 앞세운다.
  const load = usageLoad(recipe, usageCounts, mainsOf);
  const bestLoad = usageLoad(best, usageCounts, mainsOf);
  if (load !== bestLoad) return load < bestLoad;

  const byName = recipe.name.localeCompare(best.name, "ko");
  if (byName !== 0) return byName < 0;
  return recipe.id.localeCompare(best.id) < 0;
}

/**
 * 레시피가 쓴 주재료를 가상 재고에서 덜어낸다.
 * 재고에 없는 재료는 덜어낼 것도 없다 — 그건 장보기 후보로 남는다(FR-13-05).
 *
 * `remaining`을 제자리에서 고친다. FIFO 순서를 보존해야 다음 요리의 소진임박
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

/** 저장된 요리 하나. replayWeek의 입력. */
export interface StoredDish {
  date: string;
  mealType: MealType;
  isHoliday: boolean;
  holidayName: string | null;
  /** 간편식이면 null. */
  recipeId: string | null;
  convenience: ConvenienceItem | null;
  role: MealPlanDishRole;
  source: "auto" | "swapped" | "manual";
}

/**
 * 이미 저장된 한 주를 **현재 재고**로 다시 훑어 매칭 정보를 새로 계산한다.
 *
 * 배치 결과(어떤 끼니에 어떤 요리)는 그대로 두고 "부족 재료·매칭률"만 갱신하는
 * 이유는 오늘의 추천과 같다: 월요일에 짠 식단표를 목요일에 열었을 때, 이미
 * 요리해서 없어진 재료를 "보유"라고 우기면 재고 탭·요리함 체크리스트와 어긋난다.
 */
export function replayWeek(
  entries: readonly StoredDish[],
  recipes: readonly ScorableRecipe[],
  inventory: readonly VirtualInventoryEntry[],
  purchaseShares: ReadonlyMap<IngredientCategory, number>,
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
  matchingConfig: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): PlacedDish[] {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const remaining = inventory.map((entry) => entry.normalizedName);
  const placed: PlacedDish[] = [];

  for (const entry of entries) {
    // 간편식은 재료를 안 쓰므로 가상 재고를 건드리지 않고 그대로 통과시킨다.
    if (entry.role === "convenience") {
      if (!entry.convenience) continue;
      placed.push({
        date: entry.date,
        mealType: entry.mealType,
        isHoliday: entry.isHoliday,
        holidayName: entry.holidayName,
        role: "convenience",
        recipe: null,
        convenience: entry.convenience,
        score: EMPTY_SCORE,
        source: entry.source,
        availableBefore: [...new Set(remaining)],
        consumed: [],
      });
      continue;
    }

    const recipe = entry.recipeId ? byId.get(entry.recipeId) : undefined;
    // 레시피가 지워졌으면 그 요리는 조용히 건너뛴다. 호출부가 다시 채운다.
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
      role: entry.role,
      recipe,
      convenience: null,
      score,
      source: entry.source,
      availableBefore: [...ownedNames],
      consumed,
    });
  }

  return placed;
}
