// 매칭에 필요한 DB 접근을 한곳에 모은다. 점수 공식 자체는 score.ts에 있고
// 여기서는 "무엇을 읽어서 넣을지"만 정한다.

import {
  canonicalIngredient,
  expandAliases,
} from "@/lib/ingredients/aliases";
import { listInStockItems } from "@/lib/inventory/queries";
import type { ServerSupabaseClient } from "@/lib/inventory/types";
import { isMealSuitable, RECIPE_CATEGORIES } from "@/lib/recipes/meal-suitability";
import {
  DEFAULT_MATCHING_CONFIG,
  type MatchingConfig,
} from "@/lib/recipes/matching/config";
import {
  mainIngredientNames,
  rankRecipes,
  scoreRecipe,
  selectExpiringNames,
  toListItem,
  type ScorableRecipe,
} from "@/lib/recipes/matching/score";
import type {
  CookChecklistItem,
  PreferenceQuizCard,
  RecipeListItem,
  RecipeMatch,
} from "@/types/api";
import type { Database } from "@/types/database";

type RecipeRow = Database["public"]["Tables"]["recipe"]["Row"];
type RecipeIngredientRow =
  Database["public"]["Tables"]["recipe_ingredient"]["Row"];

/** PostgREST 기본 응답 상한. 이보다 큰 결과는 range로 나눠 받아야 한다. */
const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * 레시피는 1천 건대, 재료 행은 그 열 배쯤이라 한 번의 select로는 잘린다.
 * 잘린 걸 모르고 쓰면 "재료가 없는 레시피"가 대량으로 생겨 매칭이 조용히
 * 틀어지므로, 짧은 페이지가 나올 때까지 이어 받는다.
 *
 * 식단표(M3)도 같은 테이블을 같은 규모로 읽으므로 export한다 — 페이징을
 * 각자 구현하면 한쪽만 1000행에서 조용히 잘리는 사고가 난다.
 */
export async function fetchAllPages<T>(
  runPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await runPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}

export interface HouseholdMatchContext {
  /** FIFO 정렬된 재고 (FR-04-02). */
  items: Awaited<ReturnType<typeof listInStockItems>>;
  ownedNames: Set<string>;
  expiringNames: Set<string>;
  /** V2 Level 1: 취향 퀴즈 좋아요 + 북마크 + 요리 이력에서 모은 선호 재료. */
  preferredNames: Set<string>;
  /** V2 Level 1: 취향 퀴즈 싫어요에서 모은 재료. */
  dislikedNames: Set<string>;
}

/**
 * 매칭 한 번에 필요한 가구 쪽 입력. 재고 조회는 재고 탭과 같은 함수를 쓴다 —
 * 정렬 규칙이 갈라지면 "소진임박"의 정의가 화면마다 달라진다.
 */
export async function loadHouseholdMatchContext(
  supabase: ServerSupabaseClient,
  householdId: string,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Promise<HouseholdMatchContext> {
  const [items, signals] = await Promise.all([
    listInStockItems(supabase, householdId),
    loadPreferenceSignals(supabase, householdId),
  ]);
  return {
    items,
    // FR-07-05: 대표 이름으로 모아 둔다. 레시피 재료 쪽(toScorable)도 같은
    // 함수를 거치므로 하류는 전부 같은 이름끼리 비교하게 된다.
    ownedNames: new Set(
      items.map((item) => canonicalIngredient(item.normalizedName)),
    ),
    expiringNames: selectExpiringNames(items, config),
    preferredNames: signals.preferredNames,
    dislikedNames: signals.dislikedNames,
  };
}

export interface PreferenceSignals {
  preferredNames: Set<string>;
  dislikedNames: Set<string>;
}

/**
 * 취향 신호를 "재료" 집합으로 모은다 (V2 Level 1).
 *
 * 레시피 단위가 아니라 재료 단위로 일반화하는 이유: 카레 하나를 좋아요
 * 했다고 그 카레 레시피만 올려서는 취향 반영이 거의 안 느껴진다. 재료로
 * 모으면 "카레류 전체"가 함께 오른다.
 *
 * 좋아요(recipe_preference.rating='like') + 북마크(recipe_bookmark) + 요리
 * 이력(recipe_cook_log)을 전부 "좋아하는 쪽" 신호로 합친다 — 담아두거나
 * 실제로 만들어 먹은 것도 명시적 좋아요만큼 강한 신호다. '보통'(neutral)은
 * 어느 쪽도 아니다 — 신호 없음이 아니라 "그저 그렇다"는 명시적 중립이므로
 * 가산·감산 어느 쪽에도 넣지 않는다.
 */
export async function loadPreferenceSignals(
  supabase: ServerSupabaseClient,
  householdId: string,
): Promise<PreferenceSignals> {
  const [
    { data: preferenceRows, error: preferenceError },
    { data: bookmarkRows, error: bookmarkError },
    { data: cookRows, error: cookError },
  ] = await Promise.all([
    supabase
      .from("recipe_preference")
      .select("recipe_id, rating")
      .eq("household_id", householdId),
    supabase
      .from("recipe_bookmark")
      .select("recipe_id")
      .eq("household_id", householdId),
    supabase
      .from("recipe_cook_log")
      .select("recipe_id")
      .eq("household_id", householdId),
  ]);

  if (preferenceError) throw new Error(preferenceError.message);
  if (bookmarkError) throw new Error(bookmarkError.message);
  if (cookError) throw new Error(cookError.message);

  const likedRecipeIds = new Set<string>();
  const dislikedRecipeIds = new Set<string>();

  for (const row of preferenceRows ?? []) {
    if (row.rating === "like") likedRecipeIds.add(row.recipe_id);
    else if (row.rating === "dislike") dislikedRecipeIds.add(row.recipe_id);
  }
  for (const row of bookmarkRows ?? []) likedRecipeIds.add(row.recipe_id);
  for (const row of cookRows ?? []) likedRecipeIds.add(row.recipe_id);

  const allIds = [...new Set([...likedRecipeIds, ...dislikedRecipeIds])];
  if (allIds.length === 0) {
    return { preferredNames: new Set(), dislikedNames: new Set() };
  }

  const recipes = await fetchScorableRecipes(supabase, allIds);
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  const preferredNames = new Set<string>();
  const dislikedNames = new Set<string>();
  for (const id of likedRecipeIds) {
    const recipe = byId.get(id);
    if (!recipe) continue;
    for (const name of mainIngredientNames(recipe)) preferredNames.add(name);
  }
  for (const id of dislikedRecipeIds) {
    const recipe = byId.get(id);
    if (!recipe) continue;
    for (const name of mainIngredientNames(recipe)) dislikedNames.add(name);
  }

  return { preferredNames, dislikedNames };
}

/** "요리함" 처리 이력에 한 줄 남긴다. 실패해도 재고 소진 자체는 막지 않는다. */
export async function logRecipeCooked(
  supabase: ServerSupabaseClient,
  householdId: string,
  recipeId: string,
): Promise<void> {
  const { error } = await supabase.from("recipe_cook_log").insert({
    household_id: householdId,
    recipe_id: recipeId,
  });
  if (error) throw new Error(error.message);
}

/** 카드 순서·후보 순서를 매번 다르게 섞는다 (Fisher–Yates). */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 카테고리 하나에서 넉넉히 받아 섞은 뒤 자른다 — 매번 앞쪽 몇 개만 나오는 걸 막는다. */
const QUIZ_SAMPLE_MULTIPLIER = 4;

/**
 * 취향 퀴즈 후보 (마이페이지 → 취향 설정, V2 Level 1).
 *
 * 요리종류(RCP_PAT2) 전반에서 고르게 뽑는다 — 반찬에만 몰리면 "취향"이
 * 아니라 "반찬 취향"만 파악된다. 이미 평가한 레시피는 뺀다(다시 열어도
 * 새 카드가 나오게).
 */
export async function loadPreferenceQuizCandidates(
  supabase: ServerSupabaseClient,
  householdId: string,
  count: number,
): Promise<PreferenceQuizCard[]> {
  const { data: ratedRows, error: ratedError } = await supabase
    .from("recipe_preference")
    .select("recipe_id")
    .eq("household_id", householdId);
  if (ratedError) throw new Error(ratedError.message);
  const ratedIds = new Set((ratedRows ?? []).map((row) => row.recipe_id));

  const perCategory = Math.max(1, Math.ceil(count / RECIPE_CATEGORIES.length));
  const picked: PreferenceQuizCard[] = [];

  for (const category of RECIPE_CATEGORIES) {
    const { data, error } = await supabase
      .from("recipe")
      .select("id, name, image_url, category")
      .eq("category", category)
      .limit(perCategory * QUIZ_SAMPLE_MULTIPLIER);
    if (error) throw new Error(error.message);

    const pool = (data ?? []).filter((row) => !ratedIds.has(row.id));
    picked.push(
      ...shuffled(pool)
        .slice(0, perCategory)
        .map((row) => ({
          id: row.id,
          name: row.name,
          imageUrl: row.image_url,
          category: row.category,
        })),
    );
  }

  return shuffled(picked).slice(0, count);
}

/** 이 가구가 지금까지 평가한 카드 수 — 퀴즈 화면의 진행 표시에 쓴다. */
export async function countPreferenceRatings(
  supabase: ServerSupabaseClient,
  householdId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("recipe_preference")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** 취향 퀴즈 카드 한 장을 평가(또는 재평가)한다. */
export async function submitPreferenceRating(
  supabase: ServerSupabaseClient,
  householdId: string,
  recipeId: string,
  rating: "like" | "neutral" | "dislike",
): Promise<void> {
  const { error } = await supabase.from("recipe_preference").upsert(
    { household_id: householdId, recipe_id: recipeId, rating },
    { onConflict: "household_id,recipe_id" },
  );
  if (error) throw new Error(error.message);
}

function toScorable(
  recipe: RecipeRow,
  ingredients: RecipeIngredientRow[],
): ScorableRecipe {
  return {
    id: recipe.id,
    name: recipe.name,
    imageUrl: recipe.image_url,
    calories: recipe.calories,
    category: recipe.category,
    ingredients: ingredients.map((row) => ({
      normalizedName: canonicalIngredient(row.normalized_name),
      role: row.role,
      isWhitelistedSeasoning: row.is_whitelisted_seasoning,
    })),
  };
}

async function fetchIngredientsByRecipe(
  supabase: ServerSupabaseClient,
  recipeIds: string[],
): Promise<Map<string, RecipeIngredientRow[]>> {
  const byRecipe = new Map<string, RecipeIngredientRow[]>();
  if (recipeIds.length === 0) return byRecipe;

  const rows: RecipeIngredientRow[] = [];
  for (const chunk of chunkIds(recipeIds)) {
    rows.push(
      ...(await fetchAllPages<RecipeIngredientRow>((from, to) =>
        supabase
          .from("recipe_ingredient")
          .select()
          .in("recipe_id", chunk)
          .order("id", { ascending: true })
          .range(from, to),
      )),
    );
  }

  for (const row of rows) {
    const bucket = byRecipe.get(row.recipe_id);
    if (bucket) bucket.push(row);
    else byRecipe.set(row.recipe_id, [row]);
  }
  return byRecipe;
}

/**
 * id 목록을 URL에 실을 수 있는 크기로 자른다.
 *
 * PostgREST의 `.in()`은 id를 전부 쿼리스트링에 넣는다. 재고가 늘어 후보가
 * 577개가 되자 URL이 21KB가 되어 **Bad Request**로 거부당했다 — 재고를
 * 몇 개 더 담았을 뿐인데 레시피 탭이 통째로 죽는다. 재고가 적을 때는
 * 멀쩡히 돌기 때문에 개발 중에는 드러나지 않는 종류의 한계다.
 *
 * 200은 식단표 쪽(lib/meal-plan/queries.ts)에서 이미 쓰던 값이다.
 */
const ID_CHUNK = 200;

function chunkIds(ids: readonly string[]): string[][] {
  const chunks: string[][] = [];
  for (let start = 0; start < ids.length; start += ID_CHUNK) {
    chunks.push([...ids.slice(start, start + ID_CHUNK)]);
  }
  return chunks;
}

/** 주어진 id들의 레시피를 재료까지 붙여서 읽는다. 없는 id는 조용히 빠진다. */
export async function fetchScorableRecipes(
  supabase: ServerSupabaseClient,
  recipeIds: string[],
): Promise<ScorableRecipe[]> {
  if (recipeIds.length === 0) return [];

  const recipes: RecipeRow[] = [];
  for (const chunk of chunkIds(recipeIds)) {
    recipes.push(
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

  const ingredients = await fetchIngredientsByRecipe(
    supabase,
    recipes.map((recipe) => recipe.id),
  );

  return recipes.map((recipe) =>
    toScorable(recipe, ingredients.get(recipe.id) ?? []),
  );
}

/**
 * 재고 재료를 하나라도 쓰는 레시피 id. 전체 레시피를 매번 점수 계산하는 대신
 * 후보를 좁힌다 — 겹치는 재료가 없으면 어차피 0점이고, 0점끼리는 순서를
 * 이름으로 가를 뿐이라 목록 품질에 기여하지 않는다.
 */
async function fetchCandidateRecipeIds(
  supabase: ServerSupabaseClient,
  ownedNames: Set<string>,
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

/** LIKE/ILIKE 패턴의 와일드카드 문자를 문자 그대로 취급하게 이스케이프한다. */
function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

/**
 * 자유 검색어로 전체 레시피에서 찾는다. fetchCandidateRecipeIds는 "지금 있는
 * 재료로 뭘 만들 수 있나"를 좁히는 함수라 검색에는 못 쓴다 — 검색은 반대로
 * "이 재료·이름을 쓰는 레시피가 뭐가 있나"를 보유 여부와 상관없이 찾아야
 * 한다. 이름과 주재료 둘 다 대상으로 하고(김치찌개 / 김치 둘 다 걸리게),
 * 조미료는 검색해도 의미가 없어 주재료(role=main)만 본다.
 */
async function searchRecipeIds(
  supabase: ServerSupabaseClient,
  query: string,
): Promise<string[]> {
  const pattern = `%${escapeLikePattern(query)}%`;

  const [byName, byIngredient] = await Promise.all([
    fetchAllPages<Pick<RecipeRow, "id">>((from, to) =>
      supabase
        .from("recipe")
        .select("id")
        .ilike("name", pattern)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<Pick<RecipeIngredientRow, "recipe_id">>((from, to) =>
      supabase
        .from("recipe_ingredient")
        .select("recipe_id")
        .eq("role", "main")
        .ilike("normalized_name", pattern)
        .order("recipe_id", { ascending: true })
        .range(from, to),
    ),
  ]);

  return [
    ...new Set([
      ...byName.map((row) => row.id),
      ...byIngredient.map((row) => row.recipe_id),
    ]),
  ];
}

/** 재고가 아예 없는 가구용 폴백 — 목록 탭이 통째로 비지 않게 앞에서 몇 개. */
async function fetchRecipeSample(
  supabase: ServerSupabaseClient,
  limit: number,
): Promise<ScorableRecipe[]> {
  const { data, error } = await supabase
    .from("recipe")
    .select()
    .order("name", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  const recipes = data ?? [];

  const ingredients = await fetchIngredientsByRecipe(
    supabase,
    recipes.map((recipe) => recipe.id),
  );
  return recipes.map((recipe) =>
    toScorable(recipe, ingredients.get(recipe.id) ?? []),
  );
}

/**
 * FR-09-02: 온디맨드 레시피 목록. 매칭률 순으로 정렬해 앞에서 limit개.
 * 부분 매칭도 그대로 포함한다 (FR-08-02).
 */
export async function buildRankedRecipeList(
  supabase: ServerSupabaseClient,
  householdId: string,
  limit: number,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
  /**
   * FR-09-03: 볼 분류. 비어 있으면 전부.
   *
   * 화면이 아니라 여기서 거르는 이유: 목록은 매칭순 상위 limit개라, 받은 뒤에
   * 거르면 "후식만 보기"에 서너 개만 남는다. 거르고 나서 상위 limit개를
   * 뽑아야 어떤 분류를 골라도 목록이 제대로 찬다.
   */
  categories: readonly string[] = [],
  /**
   * 자유 검색어(레시피 검색 기능). 있으면 "보유 재료와 겹치는 것"이 아니라
   * 이름·주재료에 이 문자열이 들어간 레시피 전체에서 찾는다. 검색 결과가
   * 0건이면 재고 샘플로 대체하지 않는다 — "김치"를 검색했는데 엉뚱한
   * 레시피가 나오면 검색이 고장난 것처럼 보인다.
   */
  query?: string,
): Promise<RecipeListItem[]> {
  const context = await loadHouseholdMatchContext(supabase, householdId, config);
  const trimmedQuery = query?.trim();

  const candidateIds = trimmedQuery
    ? await searchRecipeIds(supabase, trimmedQuery)
    : await fetchCandidateRecipeIds(supabase, context.ownedNames);

  const all =
    candidateIds.length > 0
      ? await fetchScorableRecipes(supabase, candidateIds)
      : trimmedQuery
        ? []
        : await fetchRecipeSample(supabase, limit);

  const wanted = new Set(categories);
  const recipes =
    wanted.size === 0
      ? all
      : all.filter((recipe) => wanted.has(recipe.category ?? "기타"));

  return rankRecipes(
    recipes,
    context.ownedNames,
    context.expiringNames,
    context.preferredNames,
    context.dislikedNames,
    config,
  ).slice(0, limit);
}

// ---------------------------------------------------------------------------
// 레시피 북마크 — 가구가 공유하는 저장 목록
// ---------------------------------------------------------------------------

/**
 * 이 가구가 담은 레시피를 최근에 담은 순으로 준다. 매칭 점수 순이 아니라
 * 담은 순서인 이유는 이 목록의 성격이 "지금 만들기 좋은 것"이 아니라
 * "나중에 보려고 챙겨둔 것"이라서다 — 방금 담은 게 맨 위에 있어야 한다.
 *
 * 매칭 정보는 목록/상세와 똑같이 **현재 재고 기준으로 매번 다시 계산**한다
 * (getOrCreateTodayRecipes와 같은 이유 — 담을 당시 재고를 그대로 우기면
 * 이미 다 써버린 재료를 "보유"라고 표시하게 된다).
 */
export async function listBookmarkedRecipes(
  supabase: ServerSupabaseClient,
  householdId: string,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Promise<RecipeListItem[]> {
  const { data, error } = await supabase
    .from("recipe_bookmark")
    .select("recipe_id")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const bookmarkedIds = (data ?? []).map((row) => row.recipe_id);
  if (bookmarkedIds.length === 0) return [];

  const context = await loadHouseholdMatchContext(supabase, householdId, config);
  const recipes = await fetchScorableRecipes(supabase, bookmarkedIds);
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  return bookmarkedIds.flatMap((recipeId) => {
    const recipe = byId.get(recipeId);
    if (!recipe) return []; // 담은 뒤 레시피 자체가 지워진 경우
    const match = scoreRecipe(
      recipe,
      context.ownedNames,
      context.expiringNames,
      context.preferredNames,
      context.dislikedNames,
      config,
    );
    return [toListItem(recipe, match, config)];
  });
}

// ---------------------------------------------------------------------------
// FR-09-01 — 오늘의 추천 (하루 고정)
// ---------------------------------------------------------------------------

/**
 * 그날의 추천을 읽거나, 없으면 뽑아서 저장한 뒤 읽는다.
 *
 * 고정되는 것은 **어떤 레시피를 몇 번째로 보여줄지**까지다. 매칭 정보(부족
 * 재료, 매칭률)는 응답할 때마다 현재 재고로 다시 계산한다 — 아침에 뽑힌
 * 추천을 저녁에 열었을 때 이미 요리해서 없어진 재료를 "보유"라고 우기면
 * 상세 화면·요리함 체크리스트와 어긋나기 때문이다. 뽑을 당시 점수는
 * daily_recommendation.match_score에 남겨 나중에 추천 품질을 되짚는 데 쓴다.
 */
export async function getOrCreateTodayRecipes(
  supabase: ServerSupabaseClient,
  householdId: string,
  date: string,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Promise<RecipeListItem[]> {
  const context = await loadHouseholdMatchContext(supabase, householdId, config);

  let picks = await readTodayPicks(supabase, householdId, date);

  if (picks.length === 0) {
    const candidateIds = await fetchCandidateRecipeIds(
      supabase,
      context.ownedNames,
    );
    const ranked = rankRecipes(
      // FR-13-06: 오늘의 저녁거리를 묻는 자리라 후식은 후보가 아니다.
      // 레시피 탭 목록(buildRankedRecipeList)에는 그대로 남는다 — 거기서는
      // 분류 배지를 붙여 구분만 하고 감추지 않는다.
      (await fetchScorableRecipes(supabase, candidateIds)).filter((recipe) =>
        isMealSuitable(recipe.category),
      ),
      context.ownedNames,
      context.expiringNames,
      context.preferredNames,
      context.dislikedNames,
      config,
    )
      // 겹치는 재료가 하나도 없는 레시피를 "오늘의 추천"으로 내밀 이유는 없다.
      // 후보가 없으면 그냥 빈 목록이고, 화면은 재고를 채우라고 안내한다.
      .filter((item) => item.match.score > 0)
      .slice(0, config.todayRecipeCount);

    if (ranked.length === 0) return [];

    const { error } = await supabase.from("daily_recommendation").upsert(
      ranked.map((item, index) => ({
        household_id: householdId,
        date,
        recipe_id: item.id,
        rank: index,
        match_score: item.match.score,
      })),
      { onConflict: "household_id,date,recipe_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);

    // 저장한 걸 다시 읽는다. 같은 순간에 들어온 두 요청이 서로 다른 집합을
    // 뽑았더라도, 응답은 결국 테이블에 남은 것 하나로 수렴한다.
    picks = await readTodayPicks(supabase, householdId, date);
  }

  const recipes = await fetchScorableRecipes(supabase, picks);
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  return picks.flatMap((recipeId) => {
    const recipe = byId.get(recipeId);
    if (!recipe) return []; // 그 사이 레시피가 지워진 경우
    const match = scoreRecipe(
      recipe,
      context.ownedNames,
      context.expiringNames,
      context.preferredNames,
      context.dislikedNames,
      config,
    );
    return [toListItem(recipe, match, config)];
  });
}

async function readTodayPicks(
  supabase: ServerSupabaseClient,
  householdId: string,
  date: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("daily_recommendation")
    .select("recipe_id, rank")
    .eq("household_id", householdId)
    .eq("date", date)
    .order("rank", { ascending: true });

  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((row) => row.recipe_id))];
}

// ---------------------------------------------------------------------------
// FR-05-01 — 요리함 체크리스트
// ---------------------------------------------------------------------------

export interface RecipeMatchDetail {
  /** 영양 정보·조리 순서까지 필요한 상세 화면용 원본 행. */
  row: RecipeRow;
  /** 재료 원본 행 — 상세 화면이 조미료까지 전부 보여준다. */
  ingredientRows: RecipeIngredientRow[];
  recipe: ScorableRecipe;
  match: RecipeMatch;
  context: HouseholdMatchContext;
}

/** 상세 화면과 요리함이 같은 계산을 두 번 하지 않도록 한 번에 만든다. */
export async function loadRecipeMatch(
  supabase: ServerSupabaseClient,
  householdId: string,
  recipeId: string,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Promise<RecipeMatchDetail | null> {
  const context = await loadHouseholdMatchContext(supabase, householdId, config);

  const { data: row, error } = await supabase
    .from("recipe")
    .select()
    .eq("id", recipeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return null;

  const ingredientRows =
    (await fetchIngredientsByRecipe(supabase, [row.id])).get(row.id) ?? [];
  const recipe = toScorable(row, ingredientRows);

  return {
    row,
    ingredientRows,
    recipe,
    match: scoreRecipe(
      recipe,
      context.ownedNames,
      context.expiringNames,
      context.preferredNames,
      context.dislikedNames,
      config,
    ),
    context,
  };
}

/**
 * 이 레시피의 주재료에 걸리는, 재고에 있는 항목들.
 *
 * 같은 재료를 여러 번 샀으면 FIFO상 가장 오래된 한 행만 올린다. 한 끼 요리로
 * 우유 세 팩이 한꺼번에 사라지면 안 되고, 없앨 게 더 있으면 재고 탭에서
 * 직접 지우는 길이 이미 있다 (FR-05-02).
 */
export async function buildCookChecklist(
  supabase: ServerSupabaseClient,
  householdId: string,
  recipeId: string,
  config: MatchingConfig = DEFAULT_MATCHING_CONFIG,
): Promise<CookChecklistItem[] | null> {
  const detail = await loadRecipeMatch(supabase, householdId, recipeId, config);
  if (!detail) return null;

  const mainNames = new Set(mainIngredientNames(detail.recipe));
  const used = new Set<string>();
  const checklist: CookChecklistItem[] = [];

  for (const item of detail.context.items) {
    // 재고 이름도 대표 이름으로 맞춰 봐야 쌀↔밥이 체크리스트에 걸린다.
    const canonical = canonicalIngredient(item.normalizedName);
    if (!mainNames.has(canonical)) continue;
    if (used.has(canonical)) continue;
    used.add(canonical);
    checklist.push({
      inventoryItemId: item.id,
      normalizedName: item.normalizedName,
      rawName: item.rawName,
      quantity: item.quantity,
      daysSincePurchase: item.daysSincePurchase,
    });
  }

  return checklist;
}

/**
 * FR-05-01/FR-05-03: 받은 id만 소진 처리한다. 수량 차감은 없다.
 * household_id 조건을 직접 건다 — RLS가 이미 막지만, 남의 재고 id가 섞여
 * 들어왔을 때 "조용히 통과"가 아니라 "0건 처리"가 되어야 한다.
 */
export async function consumeItemsForRecipe(
  supabase: ServerSupabaseClient,
  householdId: string,
  inventoryItemIds: string[],
  remainingFractions: Record<string, number> = {},
): Promise<number> {
  if (inventoryItemIds.length === 0) return 0;

  const ids = [...new Set(inventoryItemIds)];

  // 전량 소진(남길 비율 0)은 한 번의 update로 끝낸다 — 대부분이 이 경우다.
  const fullyUsed = ids.filter((id) => !(remainingFractions[id] > 0));
  const partiallyUsed = ids.filter((id) => remainingFractions[id] > 0);

  let consumedCount = 0;

  if (fullyUsed.length > 0) {
    const { data, error } = await supabase
      .from("inventory_item")
      .update({
        remaining_fraction: 0,
        status: "consumed",
        consumed_at: new Date().toISOString(),
        consumed_via: "recipe_cooked",
      })
      .eq("household_id", householdId)
      .eq("status", "in_stock")
      .in("id", fullyUsed)
      .select("id");

    if (error) throw new Error(error.message);
    consumedCount += (data ?? []).length;
  }

  // 일부만 쓴 항목은 남는 비율이 제각각이라 한 건씩 갱신한다.
  // status는 in_stock 그대로여서 계속 레시피 매칭에 잡힌다 (FR-05-03).
  for (const id of partiallyUsed) {
    const { data, error } = await supabase
      .from("inventory_item")
      .update({ remaining_fraction: clampFraction(remainingFractions[id]) })
      .eq("household_id", householdId)
      .eq("status", "in_stock")
      .eq("id", id)
      .select("id");

    if (error) throw new Error(error.message);
    consumedCount += (data ?? []).length;
  }

  return consumedCount;
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}
