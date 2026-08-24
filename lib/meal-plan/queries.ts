// 식단표에 필요한 DB 접근을 한곳에 모은다. 배치 규칙 자체는 generate.ts에
// 있고 여기서는 "무엇을 읽어 넣고, 결과를 어떻게 남길지"만 정한다.
// (lib/inventory/queries.ts · lib/recipes/matching/queries.ts와 같은 구조 —
//  Supabase 클라이언트를 인자로 받아 세션/서비스롤 양쪽에서 쓸 수 있게 한다.)

import {
  canonicalIngredient,
  expandAliases,
} from "@/lib/ingredients/aliases";
import { listInStockItems, todayInSeoul } from "@/lib/inventory/queries";
import { portionsOf } from "@/lib/inventory/portions";
import type { ServerSupabaseClient } from "@/lib/inventory/types";
import {
  DEFAULT_MEAL_PLAN_CONFIG,
  type MealPlanConfig,
} from "@/lib/meal-plan/config";
import {
  placeWeek,
  replayWeek,
  slotKey,
  type LockedDish,
  type PlacedDish,
  type StoredDish,
} from "@/lib/meal-plan/generate";
import { dishRoleOf } from "@/lib/meal-plan/composition";
import { convenienceByKey } from "@/lib/meal-plan/convenience";
import { loadHolidays } from "@/lib/meal-plan/holidays";
import {
  summarizeWeeklyNutrition,
  type SlotNutrition,
} from "@/lib/meal-plan/nutrition";
import {
  purchaseCategoryShares,
  scoreForMealPlan,
  toRecipeMatch,
} from "@/lib/meal-plan/score";
import {
  buildWeekSlots,
  weekEndFor,
  type PlannedSlot,
} from "@/lib/meal-plan/slots";
import {
  DEFAULT_MATCHING_CONFIG,
  type MatchingConfig,
} from "@/lib/recipes/matching/config";
import { isMealSuitable } from "@/lib/recipes/meal-suitability";
import { fetchAllPages, loadPreferenceSignals } from "@/lib/recipes/matching/queries";
import {
  rankRecipes,
  selectExpiringNames,
  toListItem,
  type ScorableRecipe,
} from "@/lib/recipes/matching/score";
import type {
  MealPlanCandidatesResponse,
  MealPlanResponse,
  MealPlanSlot,
  WeeklyNutritionSummary,
} from "@/types/api";
import type { Database } from "@/types/database";
import type { IngredientCategory, MealType } from "@/types/domain";

type RecipeRow = Database["public"]["Tables"]["recipe"]["Row"];
type RecipeIngredientRow =
  Database["public"]["Tables"]["recipe_ingredient"]["Row"];
type MealPlanEntryRow = Database["public"]["Tables"]["meal_plan_entry"]["Row"];

/** 영양 합계(FR-14-01)까지 필요해서 ScorableRecipe에 영양 정보를 얹은 형태. */
export interface MealPlanRecipe extends ScorableRecipe {
  nutrition: SlotNutrition;
  /** FR-13-06: 식약처 요리종류 원문. "후식"이면 끼니 후보에서 뺀다. */
  category: string | null;
}

/**
 * FR-13-06: "간식이 아닌 것"을 고르는 PostgREST 조건.
 *
 * category가 null인 행도 통과시켜야 한다 — 백필 전이거나 다른 소스에서 온
 * 행을 전부 떨어뜨리면 후보 풀이 비어 식단표가 빈 칸이 된다(FR-13-03 위반).
 * 판정 기준은 lib/recipes/meal-suitability.ts와 같아야 하며, 여기는 그것을
 * SQL로 옮겨 적은 것이다 — 앱에서 거르기 전에 DB에서 먼저 줄여야
 * candidatePoolSize만큼 뽑았을 때 간식이 자리를 차지하지 않는다.
 */
const MEAL_ONLY_FILTER = "category.is.null,category.neq.후식";

// ---------------------------------------------------------------------------
// 레시피 후보 풀
// ---------------------------------------------------------------------------

function toMealPlanRecipe(
  row: RecipeRow,
  ingredients: RecipeIngredientRow[],
): MealPlanRecipe {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    calories: row.calories,
    category: row.category,
    ingredients: ingredients.map((ingredient) => ({
      normalizedName: canonicalIngredient(ingredient.normalized_name),
      role: ingredient.role,
      isWhitelistedSeasoning: ingredient.is_whitelisted_seasoning,
    })),
    nutrition: {
      calories: row.calories,
      carbohydrate: row.carbohydrate,
      protein: row.protein,
      fat: row.fat,
      sodium: row.sodium,
    },
  };
}

/**
 * 주어진 id들의 레시피를 재료까지 붙여 읽는다.
 *
 * 재료 행은 레시피 1,156개에 대해 12,000행대라 PostgREST의 1000행 상한에
 * 확실히 걸린다. `fetchAllPages`를 반드시 태워야 하고, 안 그러면 뒤쪽
 * 레시피들이 "재료 없음"이 되어 매칭률 0으로 조용히 잘린다.
 */
export async function fetchMealPlanRecipes(
  supabase: ServerSupabaseClient,
  recipeIds: string[],
): Promise<MealPlanRecipe[]> {
  const ids = [...new Set(recipeIds)];
  if (ids.length === 0) return [];

  const rows: RecipeRow[] = [];
  // `.in()`은 URL 길이 제한이 있어 id를 통째로 넣으면 긴 목록에서 깨진다.
  const CHUNK = 200;
  for (let start = 0; start < ids.length; start += CHUNK) {
    const chunk = ids.slice(start, start + CHUNK);
    rows.push(
      ...(await fetchAllPages<RecipeRow>((from, to) =>
        supabase
          .from("recipe")
          .select()
          .in("id", chunk)
          .order("id", { ascending: true })
          .range(from, to),
      )),
    );
  }

  const byRecipe = new Map<string, RecipeIngredientRow[]>();
  for (let start = 0; start < ids.length; start += CHUNK) {
    const chunk = ids.slice(start, start + CHUNK);
    const ingredientRows = await fetchAllPages<RecipeIngredientRow>((from, to) =>
      supabase
        .from("recipe_ingredient")
        .select()
        .in("recipe_id", chunk)
        .order("id", { ascending: true })
        .range(from, to),
    );
    for (const row of ingredientRows) {
      const bucket = byRecipe.get(row.recipe_id);
      if (bucket) bucket.push(row);
      else byRecipe.set(row.recipe_id, [row]);
    }
  }

  return rows.map((row) => toMealPlanRecipe(row, byRecipe.get(row.id) ?? []));
}

/** 재고 재료를 하나라도 쓰는 레시피 id. matching/queries.ts와 같은 좁히기다. */
async function fetchOverlappingRecipeIds(
  supabase: ServerSupabaseClient,
  ownedNames: ReadonlySet<string>,
): Promise<string[]> {
  if (ownedNames.size === 0) return [];

  const rows = await fetchAllPages<Pick<RecipeIngredientRow, "recipe_id">>(
    (from, to) =>
      supabase
        .from("recipe_ingredient")
        .select("recipe_id")
        .eq("role", "main")
        // 재고에 쌀만 있어도 밥을 쓰는 레시피가 후보에 들어와야 한다.
        .in("normalized_name", expandAliases(ownedNames))
        .order("recipe_id", { ascending: true })
        .range(from, to),
  );

  return [...new Set(rows.map((row) => row.recipe_id))];
}

/** 이름순 앞에서 n개. 후보 풀을 항상 같은 방식으로 채우기 위한 결정적 표본이다. */
async function fetchRecipeIdSample(
  supabase: ServerSupabaseClient,
  limit: number,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("recipe")
    .select("id")
    .or(MEAL_ONLY_FILTER)
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id);
}

export interface MealPlanContext {
  /** FIFO 정렬된 실재고 (재고 탭과 같은 순서). */
  inventory: { normalizedName: string }[];
  ownedNames: Set<string>;
  purchaseShares: Map<IngredientCategory, number>;
  /** V2 Level 1: 레시피 탭과 같은 취향 신호. 후보 풀 선정에 반영한다. */
  preferredNames: Set<string>;
  dislikedNames: Set<string>;
}

/**
 * 가구 쪽 입력. 재고는 재고 탭과 같은 함수를 쓴다 — 정렬 규칙이 갈라지면
 * "소진임박"의 정의가 화면마다 달라진다.
 */
export async function loadMealPlanContext(
  supabase: ServerSupabaseClient,
  householdId: string,
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
): Promise<MealPlanContext> {
  const [items, signals] = await Promise.all([
    listInStockItems(supabase, householdId),
    loadPreferenceSignals(supabase, householdId),
  ]);
  const today = todayInSeoul();

  // FR-13-04: 다양성 보너스는 **구매** 이력을 본다. 이미 다 먹어치운 항목도
  // "최근에 그 카테고리를 샀다"는 증거라 status를 가리지 않는다.
  const cutoff = new Date(
    Date.parse(`${today}T00:00:00Z`) -
      config.purchaseHistoryDays * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);

  const history = await fetchAllPages<{
    normalized_name: string;
    purchased_at: string;
  }>((from, to) =>
    supabase
      .from("inventory_item")
      .select("normalized_name, purchased_at")
      .eq("household_id", householdId)
      .gte("purchased_at", cutoff)
      .order("purchased_at", { ascending: true })
      .range(from, to),
  );

  return {
    // FR-04-09: 한 행이 여러 끼분이면 그만큼 펼친다. 가상 재고의 한 칸이
    // "한 끼에 한 번 쓸 수 있는 몫"이라, 개수를 반영하는 가장 단순한 방법이
    // 같은 이름을 그 수만큼 넣는 것이다 — 소진 로직은 손댈 필요가 없다.
    inventory: items.flatMap((item) =>
      Array<{ normalizedName: string }>(portionsOf(item)).fill({
        normalizedName: canonicalIngredient(item.normalizedName),
      }),
    ),
    ownedNames: new Set(
      items.map((item) => canonicalIngredient(item.normalizedName)),
    ),
    purchaseShares: purchaseCategoryShares(
      history.map((row) => ({
        normalizedName: row.normalized_name,
        purchasedAt: row.purchased_at,
      })),
      today,
      config,
    ),
    preferredNames: signals.preferredNames,
    dislikedNames: signals.dislikedNames,
  };
}

/**
 * 배치에 쓸 후보 풀.
 *
 * 1,156개를 칸마다 다시 점수 매기는 것은 낭비라 상위 N만 추린다. 재고와
 * 겹치는 레시피를 M2 매칭 순으로 먼저 채우고, 모자라면 이름순 표본으로
 * 메운다. 표본까지 넣는 이유는 두 가지다:
 *   - 재고가 비었거나(신규 가구) 겹치는 레시피가 칸 수보다 적을 때 빈 칸이
 *     생기면 안 된다 (FR-13-03).
 *   - 겹치는 레시피만 두면 후보가 죄다 같은 재료를 쓰게 되어 다양성 보너스가
 *     비교할 대상을 잃는다 (FR-13-04).
 */
export async function loadCandidatePool(
  supabase: ServerSupabaseClient,
  context: MealPlanContext,
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
  matchingConfig: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Promise<MealPlanRecipe[]> {
  const overlappingIds = await fetchOverlappingRecipeIds(
    supabase,
    context.ownedNames,
  );

  const expiringNames = selectExpiringNames(
    context.inventory,
    matchingConfig,
  );

  // FR-13-06: 재고와 겹치는 레시피라도 후식이면 끼니 후보가 아니다.
  // fetchMealPlanRecipes는 이미 배치된 칸을 다시 읽을 때도 쓰이므로(사용자가
  // 직접 고른 후식은 그대로 남아야 한다) 거기서 거르지 않고 여기서 거른다.
  const overlapping = (
    await fetchMealPlanRecipes(supabase, overlappingIds)
  ).filter((recipe) => isMealSuitable(recipe.category));

  const ranked = rankRecipes(
    overlapping,
    context.ownedNames,
    expiringNames,
    context.preferredNames,
    context.dislikedNames,
    matchingConfig,
  ).slice(0, config.candidatePoolSize);

  const byId = new Map(overlapping.map((recipe) => [recipe.id, recipe]));
  const pool = ranked.flatMap((item) => {
    const recipe = byId.get(item.id);
    return recipe ? [recipe] : [];
  });

  if (pool.length >= config.candidatePoolSize) return pool;

  const chosen = new Set(pool.map((recipe) => recipe.id));
  const sampleIds = (
    await fetchRecipeIdSample(supabase, config.candidatePoolSize)
  ).filter((id) => !chosen.has(id));

  const topUp = await fetchMealPlanRecipes(
    supabase,
    sampleIds.slice(0, config.candidatePoolSize - pool.length),
  );
  return [...pool, ...topUp];
}

// ---------------------------------------------------------------------------
// 주간 식단표 조회/생성
// ---------------------------------------------------------------------------

/** 같은 날은 lunch → dinner. 알파벳순이면 dinner가 먼저 와서 연쇄가 뒤집힌다. */
const MEAL_TYPE_ORDER: Record<MealType, number> = { lunch: 0, dinner: 1 };

function sortEntries(entries: MealPlanEntryRow[]): MealPlanEntryRow[] {
  return [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      MEAL_TYPE_ORDER[a.meal_type] - MEAL_TYPE_ORDER[b.meal_type],
  );
}

async function findPlanId(
  supabase: ServerSupabaseClient,
  householdId: string,
  weekStartDate: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("weekly_meal_plan")
    .select("id")
    .eq("household_id", householdId)
    .eq("week_start_date", weekStartDate)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

/**
 * 주간 식단표 행을 확보한다. unique(household_id, week_start_date) 위에서
 * upsert하므로, 같은 순간에 두 요청이 들어와도 행은 하나로 수렴한다.
 */
async function ensurePlanId(
  supabase: ServerSupabaseClient,
  householdId: string,
  weekStartDate: string,
): Promise<string> {
  const existing = await findPlanId(supabase, householdId, weekStartDate);
  if (existing) return existing;

  const { error } = await supabase
    .from("weekly_meal_plan")
    .upsert(
      { household_id: householdId, week_start_date: weekStartDate },
      { onConflict: "household_id,week_start_date", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);

  const created = await findPlanId(supabase, householdId, weekStartDate);
  if (!created) throw new Error("식단표를 만들지 못했습니다");
  return created;
}

/**
 * 저장된 행 → 배치 엔진이 읽는 요리.
 *
 * dish_role이 비어 있는 행(0010 이전에 저장된 식단표)은 분류에서 다시 유도한다.
 * 마이그레이션 시점에 이미 짜여 있던 주가 통째로 깨지지 않게 하려는 것이다.
 */
function toStoredDish(
  row: MealPlanEntryRow,
  holidayName: string | null,
  categoryById?: ReadonlyMap<string, string | null>,
): StoredDish {
  return {
    date: row.date,
    mealType: row.meal_type,
    isHoliday: row.is_holiday,
    holidayName,
    recipeId: row.recipe_id,
    convenience: convenienceByKey(row.convenience_key),
    role:
      row.dish_role ??
      dishRoleOf(categoryById?.get(row.recipe_id ?? "") ?? null),
    source: row.source,
  };
}

async function readEntries(
  supabase: ServerSupabaseClient,
  planId: string,
): Promise<MealPlanEntryRow[]> {
  const { data, error } = await supabase
    .from("meal_plan_entry")
    .select()
    .eq("weekly_meal_plan_id", planId);

  if (error) throw new Error(error.message);
  return sortEntries(data ?? []);
}

/**
 * 배치 결과를 칸 테이블에 반영한다.
 *
 * upsert 대상은 unique(weekly_meal_plan_id, date, meal_type) — 0007에서
 * 추가된 제약이다. 이게 있어야 재생성을 연타하거나 탭을 두 번 빠르게 열어도
 * 같은 칸이 두 벌 생기지 않는다.
 *
 * 칸 구성이 바뀌는 경우(공휴일 정보가 뒤늦게 도착해 점심이 생기거나 사라지는
 * 경우)를 위해, 이번 주 칸 목록에 없는 행은 지운다. 안 그러면 지난 계산의
 * 유령 칸이 남아 화면에 저녁이 두 개로 보인다.
 */
async function writeEntries(
  supabase: ServerSupabaseClient,
  planId: string,
  placed: PlacedDish[],
): Promise<void> {
  // 이 주의 요리를 통째로 갈아 끼운다.
  //
  // upsert를 안 쓰는 이유: 간편식 행은 recipe_id가 null이라 유일성이 부분
  // 인덱스로 나뉘어 있고(0011), PostgREST의 ON CONFLICT는 부분 인덱스를 못
  // 잡는다. 게다가 상차림 구성이 바뀌면(반찬 수가 줄거나 일품 단독이 되면)
  // 어차피 옛 행을 지워야 하므로, 지우고 넣는 편이 규칙이 하나뿐이라 안전하다.
  const { error: deleteError } = await supabase
    .from("meal_plan_entry")
    .delete()
    .eq("weekly_meal_plan_id", planId);
  if (deleteError) throw new Error(deleteError.message);

  if (placed.length === 0) return;

  const { error } = await supabase.from("meal_plan_entry").insert(
    placed.map((dish) => ({
      weekly_meal_plan_id: planId,
      date: dish.date,
      meal_type: dish.mealType,
      is_holiday: dish.isHoliday,
      dish_role: dish.role,
      recipe_id: dish.recipe?.id ?? null,
      convenience_key: dish.convenience?.key ?? null,
      match_score: dish.score.score,
      missing_main_ingredients: dish.score.missingMainIngredients,
      source: dish.source,
    })),
  );
  if (error) throw new Error(error.message);
}

interface BuiltWeek {
  slots: MealPlanSlot[];
  nutrition: WeeklyNutritionSummary;
}

/**
 * 저장된 칸들을 화면 계약(MealPlanSlot)으로 옮긴다.
 *
 * 매칭 정보는 **응답할 때마다 현재 재고로 다시 계산한다** — 오늘의 추천과 같은
 * 방침이다(getOrCreateTodayRecipes의 주석 참고). 월요일에 짠 식단표를
 * 목요일에 열었을 때 이미 요리해서 없어진 재료를 "보유"라고 우기면 재고 탭·
 * 요리함 체크리스트와 화면이 어긋난다. 연쇄 계산(replayWeek)까지 다시 도는
 * 이유도 같다 — 월요일이 쓸 재료는 화요일 입장에서 이미 없는 셈이어야
 * 장보기 후보가 맞게 나온다.
 *
 * 반대로 `matchScore`는 저장된 값을 그대로 쓴다. 계약상 "배치 시점에 계산된
 * 점수"이고, 그때의 판단 근거로 남겨 두는 값이기 때문이다.
 */
function buildWeek(
  entries: MealPlanEntryRow[],
  recipes: MealPlanRecipe[],
  context: MealPlanContext,
  holidays: ReadonlyMap<string, string>,
  config: MealPlanConfig,
  matchingConfig: MatchingConfig,
): BuiltWeek {
  // 간편식 행은 recipe_id가 null이라, 여기서 거르면 상차림에서 통째로
  // 사라진다 (FR-13-10). 레시피도 간편식도 아닌 행만 버린다.
  const usable = entries.filter(
    (row) => row.recipe_id !== null || row.convenience_key !== null,
  );

  const placed = replayWeek(
    usable.map((row) => toStoredDish(row, holidays.get(row.date) ?? null)),
    recipes,
    context.inventory,
    context.purchaseShares,
    config,
    matchingConfig,
  );

  // 같은 (끼니, 레시피)로 저장된 행을 찾아 id·배치 점수를 붙인다.
  const rowByDish = new Map(
    entries.map((row) => [
      `${slotKey(row.date, row.meal_type)}|${row.recipe_id ?? row.convenience_key ?? ""}`,
      row,
    ]),
  );
  const nutritionById = new Map(
    recipes.map((recipe) => [recipe.id, recipe.nutrition]),
  );

  // 요리를 끼니로 묶는다. placed는 이미 시간순이라 끼니가 나온 순서를 그대로
  // 유지하면 화면 순서(FR-11-01)도 맞는다.
  const slotByKey = new Map<string, MealPlanSlot>();
  const slots: MealPlanSlot[] = [];
  const usedRecipeIds: string[] = [];

  for (const dish of placed) {
    const row = rowByDish.get(
      `${slotKey(dish.date, dish.mealType)}|${dish.recipe?.id ?? dish.convenience?.key ?? ""}`,
    );
    if (!row) continue;

    const key = slotKey(dish.date, dish.mealType);
    let slot = slotByKey.get(key);
    if (!slot) {
      slot = {
        date: dish.date,
        mealType: dish.mealType,
        isHoliday: dish.isHoliday,
        holidayName: dish.holidayName,
        dishes: [],
      };
      slotByKey.set(key, slot);
      slots.push(slot);
    }

    const match = toRecipeMatch(dish.score, matchingConfig);
    slot.dishes.push({
      id: row.id,
      role: dish.role,
      recipe: dish.recipe
        ? toListItem(dish.recipe, match, matchingConfig)
        : null,
      convenience: dish.convenience,
      // 배치 시점 점수. 저장된 값이 없으면(구버전 행) 지금 값으로 메운다.
      matchScore: row.match_score ?? dish.score.score,
      missingMainIngredients: dish.score.missingMainIngredients,
      outOfSeasonIngredients: dish.score.outOfSeasonIngredients,
      source: dish.source,
    });
    if (dish.recipe) usedRecipeIds.push(dish.recipe.id);
  }

  return {
    slots,
    // FR-14-01: 영양 합계는 **요리 단위**로 더한다. 한 끼에 국과 반찬이
    // 올라가면 그 둘을 다 먹는 것이므로, 끼니당 하나만 세면 실제보다 적게 나온다.
    nutrition: summarizeWeeklyNutrition(
      usedRecipeIds.map((id) => nutritionById.get(id) ?? null),
    ),
  };
}

async function readWeek(
  supabase: ServerSupabaseClient,
  householdId: string,
  planId: string,
  weekStartDate: string,
  holidays: ReadonlyMap<string, string>,
  degraded: boolean,
  config: MealPlanConfig,
  matchingConfig: MatchingConfig,
): Promise<MealPlanResponse> {
  const entries = await readEntries(supabase, planId);
  const context = await loadMealPlanContext(supabase, householdId, config);
  const recipes = await fetchMealPlanRecipes(
    supabase,
    entries.flatMap((row) => (row.recipe_id ? [row.recipe_id] : [])),
  );

  const { slots, nutrition } = buildWeek(
    entries,
    recipes,
    context,
    holidays,
    config,
    matchingConfig,
  );

  return {
    weekStartDate,
    weekEndDate: weekEndFor(weekStartDate),
    slots,
    nutrition,
    holidayLookupDegraded: degraded,
  };
}

/** 재생성 시 보존할 칸(FR-12-01의 includeEdited=false). */
function lockedFromEntries(
  entries: MealPlanEntryRow[],
  includeEdited: boolean,
): Map<string, LockedDish[]> {
  const locked = new Map<string, LockedDish[]>();
  if (includeEdited) return locked;

  for (const row of entries) {
    if (row.source === "auto" || !row.recipe_id) continue;
    const key = slotKey(row.date, row.meal_type);
    const dish: LockedDish = {
      recipeId: row.recipe_id,
      role: row.dish_role ?? "side",
      source: row.source,
    };
    const bucket = locked.get(key);
    if (bucket) bucket.push(dish);
    else locked.set(key, [dish]);
  }
  return locked;
}

/** 날짜에서 뽑은 안정적인 주차 씨앗. 같은 주면 항상 같은 값이어야 한다. */
function weekSeedOf(date: string): number {
  if (!date) return 0;
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / (7 * 24 * 60 * 60 * 1000));
}

async function generateInto(
  supabase: ServerSupabaseClient,
  householdId: string,
  planId: string,
  plannedSlots: PlannedSlot[],
  locked: Map<string, LockedDish[]>,
  config: MealPlanConfig,
  matchingConfig: MatchingConfig,
): Promise<void> {
  const context = await loadMealPlanContext(supabase, householdId, config);
  const pool = await loadCandidatePool(supabase, context, config, matchingConfig);

  // 보존할 칸의 레시피는 후보 풀에 없을 수 있다(사용자가 검색으로 직접 고른
  // 경우). 풀에 넣어 주지 않으면 placeWeek이 "없는 레시피"로 보고 자동 배치로
  // 되돌려 버려, 직접 고른 끼니가 재생성 한 번에 날아간다.
  const poolIds = new Set(pool.map((recipe) => recipe.id));
  const missingLocked = [...locked.values()]
    .flat()
    .map((lock) => lock.recipeId)
    .filter((id) => !poolIds.has(id));

  const recipes = [
    ...pool,
    ...(await fetchMealPlanRecipes(supabase, missingLocked)),
  ];

  const placed = placeWeek({
    slots: plannedSlots,
    recipes,
    inventory: context.inventory,
    purchaseShares: context.purchaseShares,
    locked,
    // FR-13-10: 주가 바뀌면 다른 간편식이 제안되게 한다. 같은 곰탕만 계속
    // 뜨면 이미 사둔 사람에게는 쓸모없는 제안이 된다.
    weekSeed: weekSeedOf(plannedSlots[0]?.date ?? ""),
    config,
    matchingConfig,
  });

  await writeEntries(supabase, planId, placed);
}

/**
 * FR-12-01: 그 주의 식단표를 읽고, 없으면 **조회 시점에 자동 생성**한다.
 * 칸이 하나도 없을 때만 생성한다 — 이미 있는 주를 다시 짜는 건 재생성(POST)의 몫이다.
 */
export async function getOrCreateMealPlan(
  supabase: ServerSupabaseClient,
  householdId: string,
  weekStartDate: string,
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
  matchingConfig: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Promise<MealPlanResponse> {
  const weekEndDate = weekEndFor(weekStartDate);
  const { holidays, degraded } = await loadHolidays(
    supabase,
    weekStartDate,
    weekEndDate,
  );

  const planId = await ensurePlanId(supabase, householdId, weekStartDate);
  const existing = await readEntries(supabase, planId);

  if (existing.length === 0) {
    await generateInto(
      supabase,
      householdId,
      planId,
      buildWeekSlots(weekStartDate, holidays),
      new Map(),
      config,
      matchingConfig,
    );
  }

  return readWeek(
    supabase,
    householdId,
    planId,
    weekStartDate,
    holidays,
    degraded,
    config,
    matchingConfig,
  );
}

/**
 * POST /api/meal-plan — 한 주 전체 재생성.
 * `includeEdited`가 false(기본)면 source가 swapped·manual인 칸은 그대로 둔다 —
 * 직접 고른 끼니가 재생성 한 번에 날아가면 안 된다.
 */
export async function regenerateMealPlan(
  supabase: ServerSupabaseClient,
  householdId: string,
  weekStartDate: string,
  includeEdited: boolean,
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
  matchingConfig: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Promise<MealPlanResponse> {
  const weekEndDate = weekEndFor(weekStartDate);
  const { holidays, degraded } = await loadHolidays(
    supabase,
    weekStartDate,
    weekEndDate,
  );

  const planId = await ensurePlanId(supabase, householdId, weekStartDate);
  const existing = await readEntries(supabase, planId);

  await generateInto(
    supabase,
    householdId,
    planId,
    buildWeekSlots(weekStartDate, holidays),
    lockedFromEntries(existing, includeEdited),
    config,
    matchingConfig,
  );

  return readWeek(
    supabase,
    householdId,
    planId,
    weekStartDate,
    holidays,
    degraded,
    config,
    matchingConfig,
  );
}

// ---------------------------------------------------------------------------
// 개별 칸 — 스왑 후보 / 교체
// ---------------------------------------------------------------------------

interface EntryContext {
  entry: MealPlanEntryRow;
  planId: string;
  weekStartDate: string;
  entries: MealPlanEntryRow[];
}

/**
 * 칸 하나와 그 주의 맥락을 함께 읽는다.
 *
 * household_id를 직접 확인하는 이유: RLS가 이미 막지만(NFR-04), 남의 칸 id가
 * 들어왔을 때 "조용히 다른 집 식단표를 고치는" 대신 404가 되어야 한다.
 */
async function loadEntryContext(
  supabase: ServerSupabaseClient,
  householdId: string,
  entryId: string,
): Promise<EntryContext | null> {
  const { data: entry, error } = await supabase
    .from("meal_plan_entry")
    .select()
    .eq("id", entryId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!entry) return null;

  const { data: plan, error: planError } = await supabase
    .from("weekly_meal_plan")
    .select("id, household_id, week_start_date")
    .eq("id", entry.weekly_meal_plan_id)
    .maybeSingle();

  if (planError) throw new Error(planError.message);
  if (!plan || plan.household_id !== householdId) return null;

  return {
    entry,
    planId: plan.id,
    weekStartDate: plan.week_start_date,
    entries: await readEntries(supabase, plan.id),
  };
}

/**
 * 그 칸 시점의 가상 재고. 스왑 후보도 배치와 같은 조건에서 점수를 매겨야
 * 사용자가 보는 순위와 실제 배치 논리가 어긋나지 않는다.
 */
function virtualStateAt(
  entries: MealPlanEntryRow[],
  targetEntryId: string,
  recipes: MealPlanRecipe[],
  context: MealPlanContext,
  config: MealPlanConfig,
  matchingConfig: MatchingConfig,
): { ownedNames: Set<string>; expiringNames: Set<string> } {
  const upToTarget: MealPlanEntryRow[] = [];
  for (const row of entries) {
    if (row.id === targetEntryId) break;
    upToTarget.push(row);
  }

  const placed = replayWeek(
    upToTarget.flatMap((row) =>
      row.recipe_id
        ? [toStoredDish(row as MealPlanEntryRow & { recipe_id: string }, null)]
        : [],
    ),
    recipes,
    context.inventory,
    context.purchaseShares,
    config,
    matchingConfig,
  );

  // 앞 칸들이 덜어낸 것을 원본 FIFO에서 그대로 빼 대상 칸의 시작 상태를 만든다.
  // `availableBefore`를 쓰지 않는 이유: 그건 Set에서 나온 값이라 같은 재료를
  // 두 번 산 경우 중복이 사라져 있어, 소진임박 TOP N이 실제와 달라진다.
  const fifo = context.inventory.map((item) => item.normalizedName);
  for (const name of placed.flatMap((slot) => slot.consumed)) {
    const index = fifo.indexOf(name);
    if (index !== -1) fifo.splice(index, 1);
  }

  return {
    ownedNames: new Set(fifo),
    expiringNames: selectExpiringNames(
      fifo.map((normalizedName) => ({ normalizedName })),
      matchingConfig,
    ),
  };
}

/**
 * FR-12-02: 스왑 후보. 그 주에 이미 배치된 레시피는 뺀다(FR-13-02).
 * 반환값이 null이면 그 칸이 없거나 다른 가구의 것이다.
 */
export async function listSwapCandidates(
  supabase: ServerSupabaseClient,
  householdId: string,
  entryId: string,
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
  matchingConfig: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Promise<MealPlanCandidatesResponse | null> {
  const found = await loadEntryContext(supabase, householdId, entryId);
  if (!found) return null;

  const context = await loadMealPlanContext(supabase, householdId, config);
  const pool = await loadCandidatePool(supabase, context, config, matchingConfig);
  const placedRecipes = await fetchMealPlanRecipes(
    supabase,
    found.entries.flatMap((row) => (row.recipe_id ? [row.recipe_id] : [])),
  );

  const { ownedNames, expiringNames } = virtualStateAt(
    found.entries,
    entryId,
    [...pool, ...placedRecipes],
    context,
    config,
    matchingConfig,
  );

  const usedIds = new Set(
    found.entries.flatMap((row) => (row.recipe_id ? [row.recipe_id] : [])),
  );

  const candidates = pool
    .filter((recipe) => !usedIds.has(recipe.id))
    .map((recipe) => ({
      recipe,
      score: scoreForMealPlan(
        recipe,
        ownedNames,
        expiringNames,
        context.purchaseShares,
        config,
      ),
    }))
    .sort(
      (a, b) =>
        b.score.score - a.score.score ||
        b.score.matchRate - a.score.matchRate ||
        a.recipe.name.localeCompare(b.recipe.name, "ko") ||
        a.recipe.id.localeCompare(b.recipe.id),
    )
    .slice(0, config.swapCandidateCount)
    .map(({ recipe, score }) =>
      toListItem(recipe, toRecipeMatch(score, matchingConfig), matchingConfig),
    );

  return {
    currentRecipeId: found.entry.recipe_id ?? "",
    candidates,
  };
}

export interface UpdatedEntry {
  slot: MealPlanSlot;
  nutrition: WeeklyNutritionSummary;
}

/**
 * PATCH /api/meal-plan/entries/[id] — 끼니 교체 (FR-12-02 / FR-12-03).
 *
 * source는 서버가 정한다: 후보 목록에 있던 레시피면 "swapped", 목록 밖에서
 * 직접 고른 것이면 "manual". 판단을 화면에 맡기지 않는 이유는, 재생성 때
 * 무엇을 보존할지가 이 값에 달려 있어서 사용자 편집의 흔적이 클라이언트
 * 버그 하나로 날아가면 안 되기 때문이다.
 *
 * 반환값: 칸이 없거나 남의 것이면 null, 레시피가 없으면 "recipe-not-found".
 */
export async function replaceEntryRecipe(
  supabase: ServerSupabaseClient,
  householdId: string,
  entryId: string,
  recipeId: string,
  config: MealPlanConfig = DEFAULT_MEAL_PLAN_CONFIG,
  matchingConfig: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Promise<UpdatedEntry | null | "recipe-not-found"> {
  const found = await loadEntryContext(supabase, householdId, entryId);
  if (!found) return null;

  const [replacement] = await fetchMealPlanRecipes(supabase, [recipeId]);
  if (!replacement) return "recipe-not-found";

  const candidates = await listSwapCandidates(
    supabase,
    householdId,
    entryId,
    config,
    matchingConfig,
  );
  const wasCandidate =
    candidates?.candidates.some((item) => item.id === recipeId) ?? false;

  const context = await loadMealPlanContext(supabase, householdId, config);
  const { ownedNames, expiringNames } = virtualStateAt(
    found.entries,
    entryId,
    [replacement],
    context,
    config,
    matchingConfig,
  );
  const score = scoreForMealPlan(
    replacement,
    ownedNames,
    expiringNames,
    context.purchaseShares,
    config,
  );

  const { error } = await supabase
    .from("meal_plan_entry")
    .update({
      recipe_id: recipeId,
      source: wasCandidate ? "swapped" : "manual",
      match_score: score.score,
      missing_main_ingredients: score.missingMainIngredients,
    })
    .eq("id", entryId);

  if (error) throw new Error(error.message);

  // 교체 뒤의 주 전체를 다시 읽는다 — 뒤 요일의 부족 재료와 영양 합계가
  // 함께 바뀌기 때문에, 바뀐 칸만 돌려주면 화면이 낡은 값을 들고 있게 된다.
  const { holidays, degraded } = await loadHolidays(
    supabase,
    found.weekStartDate,
    weekEndFor(found.weekStartDate),
  );

  const week = await readWeek(
    supabase,
    householdId,
    found.planId,
    found.weekStartDate,
    holidays,
    degraded,
    config,
    matchingConfig,
  );

  // 바뀐 요리가 속한 **끼니 전체**를 돌려준다. 국을 바꾸면 그 끼니의 반찬
  // 매칭도 함께 흔들리므로(연쇄 계산), 요리 하나만 주면 화면이 낡은 값을 든다.
  const slot = week.slots.find((item) =>
    item.dishes.some((dish) => dish.id === entryId),
  );
  if (!slot) return null;

  return { slot, nutrition: week.nutrition };
}
