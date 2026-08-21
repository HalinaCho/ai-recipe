// 식단표에 필요한 DB 접근을 한곳에 모은다. 배치 규칙 자체는 generate.ts에
// 있고 여기서는 "무엇을 읽어 넣고, 결과를 어떻게 남길지"만 정한다.
// (lib/inventory/queries.ts · lib/recipes/matching/queries.ts와 같은 구조 —
//  Supabase 클라이언트를 인자로 받아 세션/서비스롤 양쪽에서 쓸 수 있게 한다.)

import { listInStockItems, todayInSeoul } from "@/lib/inventory/queries";
import type { ServerSupabaseClient } from "@/lib/inventory/types";
import {
  DEFAULT_MEAL_PLAN_CONFIG,
  type MealPlanConfig,
} from "@/lib/meal-plan/config";
import {
  placeWeek,
  replayWeek,
  slotKey,
  type LockedSlot,
  type PlacedSlot,
} from "@/lib/meal-plan/generate";
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
import { fetchAllPages } from "@/lib/recipes/matching/queries";
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
}

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
    ingredients: ingredients.map((ingredient) => ({
      normalizedName: ingredient.normalized_name,
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
        .in("normalized_name", [...ownedNames])
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
  const items = await listInStockItems(supabase, householdId);
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
    inventory: items.map((item) => ({ normalizedName: item.normalizedName })),
    ownedNames: new Set(items.map((item) => item.normalizedName)),
    purchaseShares: purchaseCategoryShares(
      history.map((row) => ({
        normalizedName: row.normalized_name,
        purchasedAt: row.purchased_at,
      })),
      today,
      config,
    ),
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

  const overlapping = await fetchMealPlanRecipes(supabase, overlappingIds);
  const ranked = rankRecipes(
    overlapping,
    context.ownedNames,
    expiringNames,
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
  placed: PlacedSlot[],
): Promise<void> {
  const { error } = await supabase.from("meal_plan_entry").upsert(
    placed.map((slot) => ({
      weekly_meal_plan_id: planId,
      date: slot.date,
      meal_type: slot.mealType,
      is_holiday: slot.isHoliday,
      recipe_id: slot.recipe.id,
      match_score: slot.score.score,
      missing_main_ingredients: slot.score.missingMainIngredients,
      source: slot.source,
    })),
    { onConflict: "weekly_meal_plan_id,date,meal_type" },
  );
  if (error) throw new Error(error.message);

  const keep = new Set(placed.map((slot) => slotKey(slot.date, slot.mealType)));
  const existing = await readEntries(supabase, planId);
  const staleIds = existing
    .filter((row) => !keep.has(slotKey(row.date, row.meal_type)))
    .map((row) => row.id);

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("meal_plan_entry")
      .delete()
      .in("id", staleIds);
    if (deleteError) throw new Error(deleteError.message);
  }
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
  const withRecipe = entries.filter(
    (row): row is MealPlanEntryRow & { recipe_id: string } =>
      row.recipe_id !== null,
  );

  const placed = replayWeek(
    withRecipe.map((row) => ({
      date: row.date,
      mealType: row.meal_type,
      isHoliday: row.is_holiday,
      holidayName: holidays.get(row.date) ?? null,
      recipeId: row.recipe_id,
      source: row.source,
    })),
    recipes,
    context.inventory,
    context.purchaseShares,
    config,
    matchingConfig,
  );

  const entryByKey = new Map(
    withRecipe.map((row) => [slotKey(row.date, row.meal_type), row]),
  );
  const nutritionById = new Map(
    recipes.map((recipe) => [recipe.id, recipe.nutrition]),
  );

  const slots: MealPlanSlot[] = placed.flatMap((slot) => {
    const row = entryByKey.get(slotKey(slot.date, slot.mealType));
    if (!row) return [];

    const match = toRecipeMatch(slot.score, matchingConfig);
    return [
      {
        id: row.id,
        date: slot.date,
        mealType: slot.mealType,
        isHoliday: slot.isHoliday,
        holidayName: slot.holidayName,
        recipe: toListItem(slot.recipe, match, matchingConfig),
        // 배치 시점 점수. 저장된 값이 없으면(구버전 행) 지금 값으로 메운다.
        matchScore: row.match_score ?? slot.score.score,
        missingMainIngredients: slot.score.missingMainIngredients,
        source: slot.source,
      },
    ];
  });

  return {
    slots,
    nutrition: summarizeWeeklyNutrition(
      slots.map((slot) => nutritionById.get(slot.recipe.id) ?? null),
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
): Map<string, LockedSlot> {
  const locked = new Map<string, LockedSlot>();
  if (includeEdited) return locked;

  for (const row of entries) {
    if (row.source === "auto" || !row.recipe_id) continue;
    locked.set(slotKey(row.date, row.meal_type), {
      recipeId: row.recipe_id,
      source: row.source,
    });
  }
  return locked;
}

async function generateInto(
  supabase: ServerSupabaseClient,
  householdId: string,
  planId: string,
  plannedSlots: PlannedSlot[],
  locked: Map<string, LockedSlot>,
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
        ? [
            {
              date: row.date,
              mealType: row.meal_type,
              isHoliday: row.is_holiday,
              holidayName: null,
              recipeId: row.recipe_id,
              source: row.source,
            },
          ]
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

  const slot = week.slots.find((item) => item.id === entryId);
  if (!slot) return null;

  return { slot, nutrition: week.nutrition };
}
