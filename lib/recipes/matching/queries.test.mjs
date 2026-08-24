// 실행: node --test lib/recipes/matching/queries.test.mjs
//
// 인메모리 Supabase로 오늘의 추천 고정(FR-09-01)과 요리함 체크리스트/소진
// 처리(FR-05-01)를 돌린다. 실제 레시피 데이터(식약처 수집)는 다른 트랙이
// 만드는 중이라, 여기서는 직접 심은 행으로 검증한다.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "../../..");

function resolveSource(specifier, parentURL) {
  if (parentURL && parentURL.includes("/node_modules/")) return null;

  let base;
  if (specifier.startsWith("@/")) {
    base = path.join(projectRoot, specifier.slice(2));
  } else if (specifier.startsWith(".") && parentURL) {
    base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  } else {
    return null;
  }

  if (base.includes(`${path.sep}node_modules${path.sep}`)) return null;

  if (path.extname(base)) return existsSync(base) ? base : null;
  return (
    [`${base}.ts`, path.join(base, "index.ts")].find((candidate) =>
      existsSync(candidate),
    ) ?? null
  );
}

registerHooks({
  resolve(specifier, context, next) {
    const resolved = resolveSource(specifier, context.parentURL);
    return resolved
      ? next(pathToFileURL(resolved).href, context)
      : next(specifier, context);
  },
});

const {
  buildCookChecklist,
  buildRankedRecipeList,
  consumeItemsForRecipe,
  getOrCreateTodayRecipes,
  listBookmarkedRecipes,
  loadPreferenceQuizCandidates,
  loadPreferenceSignals,
  logRecipeCooked,
} = await import("@/lib/recipes/matching/queries.ts");

const HOUSEHOLD = "household-1";
const OTHER_HOUSEHOLD = "household-2";
const TODAY = "2026-08-21";

// ---------------------------------------------------------------------------
// 인메모리 Supabase — queries.ts가 실제로 쓰는 체인만 흉내 낸다.
// ---------------------------------------------------------------------------

function createFakeSupabase(seed = {}) {
  const db = {
    inventory_item: [],
    recipe: [],
    recipe_ingredient: [],
    daily_recommendation: [],
    recipe_bookmark: [],
    recipe_preference: [],
    recipe_cook_log: [],
    ...seed,
  };

  let autoId = 0;

  function ilikeMatch(value, pattern) {
    if (typeof value !== "string") return false;
    const regex = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*")
      .replace(/_/g, ".");
    return new RegExp(`^${regex}$`, "i").test(value);
  }

  function matches(row, state) {
    if (!state.filters.every(([column, value]) => row[column] === value)) {
      return false;
    }
    if (!state.inFilters.every(([column, values]) => values.includes(row[column]))) {
      return false;
    }
    return state.ilikeFilters.every(([column, pattern]) =>
      ilikeMatch(row[column], pattern),
    );
  }

  function sorted(rows, orders) {
    return [...rows].sort((a, b) => {
      for (const [column, ascending] of orders) {
        if (a[column] === b[column]) continue;
        const direction = a[column] > b[column] ? 1 : -1;
        return ascending ? direction : -direction;
      }
      return 0;
    });
  }

  function run(state) {
    const rows = db[state.table];

    if (state.op === "select") {
      let selected = sorted(
        rows.filter((row) => matches(row, state)),
        state.orders,
      ).map((row) => ({ ...row }));

      if (state.range) selected = selected.slice(state.range[0], state.range[1] + 1);
      if (state.limit !== null) selected = selected.slice(0, state.limit);

      if (state.single) {
        return { data: selected[0] ?? null, error: null };
      }
      return { data: selected, error: null };
    }

    if (state.op === "upsert") {
      const conflict = (state.options.onConflict ?? "").split(",").map((c) => c.trim());
      for (const record of state.payload) {
        const duplicate = rows.find((row) =>
          conflict.every((column) => row[column] === record[column]),
        );
        if (duplicate) {
          if (!state.options.ignoreDuplicates) Object.assign(duplicate, record);
          continue;
        }
        rows.push({ id: `row-${(autoId += 1)}`, ...record });
      }
      return { data: null, error: null };
    }

    if (state.op === "update") {
      const touched = [];
      for (const row of rows) {
        if (!matches(row, state)) continue;
        Object.assign(row, state.payload);
        touched.push({ ...row });
      }
      return { data: touched, error: null };
    }

    if (state.op === "insert") {
      const inserted = state.payload.map((record) => ({
        id: `row-${(autoId += 1)}`,
        created_at: new Date().toISOString(),
        ...record,
      }));
      rows.push(...inserted);
      return { data: inserted, error: null };
    }

    if (state.op === "delete") {
      const remaining = rows.filter((row) => !matches(row, state));
      const removedCount = rows.length - remaining.length;
      db[state.table] = remaining;
      return { data: null, error: null, count: removedCount };
    }

    throw new Error(`unsupported op: ${state.op}`);
  }

  function from(table) {
    const state = {
      table,
      op: "select",
      filters: [],
      inFilters: [],
      ilikeFilters: [],
      orders: [],
      range: null,
      limit: null,
      single: false,
      payload: null,
      options: {},
    };

    const builder = {
      select: () => builder,
      eq(column, value) {
        state.filters.push([column, value]);
        return builder;
      },
      in(column, values) {
        state.inFilters.push([column, values]);
        return builder;
      },
      ilike(column, pattern) {
        state.ilikeFilters.push([column, pattern]);
        return builder;
      },
      order(column, options = {}) {
        state.orders.push([column, options.ascending !== false]);
        return builder;
      },
      range(from_, to) {
        state.range = [from_, to];
        return builder;
      },
      limit(count) {
        state.limit = count;
        return builder;
      },
      maybeSingle() {
        state.single = true;
        return builder;
      },
      upsert(payload, options = {}) {
        state.op = "upsert";
        state.payload = Array.isArray(payload) ? payload : [payload];
        state.options = options;
        return builder;
      },
      update(payload) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      insert(payload) {
        state.op = "insert";
        state.payload = Array.isArray(payload) ? payload : [payload];
        return builder;
      },
      delete() {
        state.op = "delete";
        return builder;
      },
      then(resolve, reject) {
        try {
          resolve(run(state));
        } catch (error) {
          reject(error);
        }
      },
    };
    return builder;
  }

  return { db, from };
}

// ---------------------------------------------------------------------------
// 시드 헬퍼
// ---------------------------------------------------------------------------

function inventoryRow(id, normalizedName, purchasedAt, householdId = HOUSEHOLD) {
  return {
    id,
    household_id: householdId,
    normalized_name: normalizedName,
    raw_name: `${normalizedName} 상품명`,
    quantity: "1개",
    purchased_at: purchasedAt,
    source_mail_connection_id: null,
    status: "in_stock",
    consumed_at: null,
    consumed_via: null,
    created_at: `${purchasedAt}T00:00:00.000Z`,
  };
}

function bookmarkRow(id, recipeId, createdAt, householdId = HOUSEHOLD) {
  return {
    id,
    household_id: householdId,
    recipe_id: recipeId,
    created_at: createdAt,
  };
}

function preferenceRow(id, recipeId, rating, householdId = HOUSEHOLD) {
  return {
    id,
    household_id: householdId,
    recipe_id: recipeId,
    rating,
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function cookLogRow(id, recipeId, cookedAt, householdId = HOUSEHOLD) {
  return {
    id,
    household_id: householdId,
    recipe_id: recipeId,
    cooked_at: cookedAt,
  };
}

function recipeRows(id, name, mains, seasonings = []) {
  return {
    recipe: {
      id,
      source_api: "foodsafetykorea_cookrcp01",
      source_recipe_id: id,
      name,
      image_url: null,
      instructions: ["끓인다"],
      calories: 300,
      carbohydrate: null,
      protein: null,
      fat: null,
      sodium: null,
      created_at: "2026-08-01T00:00:00.000Z",
    },
    ingredients: [
      ...mains.map((normalizedName, index) => ({
        id: `${id}-m${index}`,
        recipe_id: id,
        normalized_name: normalizedName,
        role: "main",
        is_whitelisted_seasoning: false,
      })),
      ...seasonings.map((normalizedName, index) => ({
        id: `${id}-s${index}`,
        recipe_id: id,
        normalized_name: normalizedName,
        role: "seasoning",
        is_whitelisted_seasoning: true,
      })),
    ],
  };
}

const CATALOG = [
  recipeRows("r-kimchi", "돼지고기 김치찌개", ["돼지고기", "김치", "두부", "대파"], ["고춧가루"]),
  recipeRows("r-egg", "계란말이", ["계란", "대파", "당근"], ["소금"]),
  recipeRows("r-tofu", "두부조림", ["두부", "대파"], ["간장"]),
  recipeRows("r-salmon", "연어 스테이크", ["연어", "레몬"], ["후추"]),
  recipeRows("r-doenjang", "된장국", ["두부", "애호박"], ["된장"]),
];

function seededSupabase(inventory, bookmarks = []) {
  return createFakeSupabase({
    inventory_item: inventory,
    recipe: CATALOG.map((entry) => entry.recipe),
    recipe_ingredient: CATALOG.flatMap((entry) => entry.ingredients),
    recipe_bookmark: bookmarks,
  });
}

/** 두부가 가장 오래됐고, 그 다음이 대파·김치·돼지고기 순. */
function defaultInventory() {
  return [
    inventoryRow("inv-tofu", "두부", "2026-08-10"),
    inventoryRow("inv-pa", "대파", "2026-08-12"),
    inventoryRow("inv-kimchi", "김치", "2026-08-14"),
    inventoryRow("inv-pork", "돼지고기", "2026-08-16"),
  ];
}

// ---------------------------------------------------------------------------
// FR-09-01 — 오늘의 추천은 하루 동안 고정
// ---------------------------------------------------------------------------

test("첫 요청이 오늘의 추천을 뽑아 저장한다", async () => {
  const supabase = seededSupabase(defaultInventory());

  const recipes = await getOrCreateTodayRecipes(supabase, HOUSEHOLD, TODAY);

  assert.equal(recipes.length, 3, "설정된 개수만큼 뽑는다");
  // 김치찌개·두부조림 둘 다 주재료를 전부 갖췄고 전부 소진임박이라 1.0 동점 —
  // 그 다음은 이름순으로 갈린다.
  assert.equal(recipes[0].match.score, 1);
  assert.deepEqual(
    recipes.map((item) => item.name),
    ["돼지고기 김치찌개", "두부조림", "된장국"],
  );
  assert.equal(supabase.db.daily_recommendation.length, 3);
  assert.deepEqual(
    supabase.db.daily_recommendation.map((row) => row.rank),
    [0, 1, 2],
  );
  assert.ok(
    supabase.db.daily_recommendation.every((row) => row.date === TODAY),
    "행마다 가구 기준 날짜(KST)가 박혀 있어야 한다",
  );

  // 재고와 하나도 안 겹치는 레시피는 추천에 오르지 않는다.
  assert.ok(!recipes.some((item) => item.name === "연어 스테이크"));
});

test("같은 날에는 재고가 바뀌어도 추천 레시피와 순서가 그대로다", async () => {
  const supabase = seededSupabase(defaultInventory());

  const first = await getOrCreateTodayRecipes(supabase, HOUSEHOLD, TODAY);

  // 그 사이 두부를 다 쓰고 연어·레몬을 새로 샀다 — 다시 뽑으면 순위가
  // 완전히 달라질 상황.
  const tofu = supabase.db.inventory_item.find((row) => row.id === "inv-tofu");
  tofu.status = "consumed";
  supabase.db.inventory_item.push(
    inventoryRow("inv-salmon", "연어", "2026-08-20"),
    inventoryRow("inv-lemon", "레몬", "2026-08-20"),
  );

  const second = await getOrCreateTodayRecipes(supabase, HOUSEHOLD, TODAY);

  assert.deepEqual(
    second.map((item) => item.id),
    first.map((item) => item.id),
    "하루 동안은 같은 추천을 봐야 한다 (FR-09-01)",
  );
  assert.equal(
    supabase.db.daily_recommendation.length,
    3,
    "두 번째 요청이 행을 더 쓰면 안 된다",
  );
});

test("고정되는 건 선택과 순서뿐 — 부족 재료는 현재 재고로 다시 계산한다", async () => {
  const supabase = seededSupabase(defaultInventory());

  const first = await getOrCreateTodayRecipes(supabase, HOUSEHOLD, TODAY);
  const 두부조림First = first.find((item) => item.name === "두부조림");
  assert.deepEqual(두부조림First.match.missingMainIngredients, []);

  const tofu = supabase.db.inventory_item.find((row) => row.id === "inv-tofu");
  tofu.status = "consumed";

  const second = await getOrCreateTodayRecipes(supabase, HOUSEHOLD, TODAY);
  const 두부조림Second = second.find((item) => item.name === "두부조림");

  assert.deepEqual(두부조림Second.match.missingMainIngredients, ["두부"]);
  assert.ok(
    두부조림Second.match.score < 두부조림First.match.score,
    "요리하고 나면 매칭 정보는 줄어든 재고를 반영해야 한다",
  );
});

test("날짜가 바뀌면 그날 재고로 새로 뽑는다", async () => {
  const supabase = seededSupabase(defaultInventory());

  await getOrCreateTodayRecipes(supabase, HOUSEHOLD, TODAY);

  for (const row of supabase.db.inventory_item) row.status = "consumed";
  supabase.db.inventory_item.push(
    inventoryRow("inv-salmon", "연어", "2026-08-21"),
    inventoryRow("inv-lemon", "레몬", "2026-08-21"),
  );

  const tomorrow = await getOrCreateTodayRecipes(supabase, HOUSEHOLD, "2026-08-22");

  assert.deepEqual(
    tomorrow.map((item) => item.name),
    ["연어 스테이크"],
  );
  assert.equal(supabase.db.daily_recommendation.length, 4);
});

test("겹치는 재료가 없으면 오늘의 추천은 빈 목록이다", async () => {
  const supabase = seededSupabase([inventoryRow("inv-milk", "우유", "2026-08-19")]);

  const recipes = await getOrCreateTodayRecipes(supabase, HOUSEHOLD, TODAY);

  assert.deepEqual(recipes, []);
  assert.equal(supabase.db.daily_recommendation.length, 0, "빈 추천은 저장하지 않는다");
});

test("가구가 다르면 추천도 따로 간다", async () => {
  const supabase = seededSupabase([
    ...defaultInventory(),
    inventoryRow("inv-o-salmon", "연어", "2026-08-11", OTHER_HOUSEHOLD),
    inventoryRow("inv-o-lemon", "레몬", "2026-08-11", OTHER_HOUSEHOLD),
  ]);

  const mine = await getOrCreateTodayRecipes(supabase, HOUSEHOLD, TODAY);
  const theirs = await getOrCreateTodayRecipes(supabase, OTHER_HOUSEHOLD, TODAY);

  assert.ok(!mine.some((item) => item.name === "연어 스테이크"));
  assert.deepEqual(
    theirs.map((item) => item.name),
    ["연어 스테이크"],
  );
});

// ---------------------------------------------------------------------------
// FR-09-02 — 온디맨드 목록
// ---------------------------------------------------------------------------

test("목록은 매칭률 순이고 부분 매칭도 포함한다", async () => {
  const supabase = seededSupabase(defaultInventory());

  const recipes = await buildRankedRecipeList(supabase, HOUSEHOLD, 50);

  assert.deepEqual(
    recipes.map((item) => item.name),
    ["돼지고기 김치찌개", "두부조림", "된장국", "계란말이"],
  );
  assert.ok(
    !recipes.some((item) => item.name === "연어 스테이크"),
    "재료가 하나도 안 겹치는 레시피까지 끌고 오지는 않는다",
  );

  // FR-10-01: 애매한 구간(40~70%)만 밀키트 CTA.
  const byName = Object.fromEntries(recipes.map((item) => [item.name, item]));
  assert.equal(byName["두부조림"].showMealKitCta, false);
  assert.equal(byName["된장국"].showMealKitCta, true, "2개 중 1개 = 50%");
  assert.equal(byName["계란말이"].showMealKitCta, false, "3개 중 1개 = 33%");
});

// ---------------------------------------------------------------------------
// 레시피 검색 — 재고와 무관하게 이름·주재료로 전체 레시피에서 찾는다
// ---------------------------------------------------------------------------

test("검색어가 레시피 이름에 있으면 재고가 없어도 찾는다", async () => {
  const supabase = seededSupabase([]);

  const recipes = await buildRankedRecipeList(
    supabase,
    HOUSEHOLD,
    50,
    undefined,
    [],
    "김치찌개",
  );

  assert.deepEqual(
    recipes.map((item) => item.name),
    ["돼지고기 김치찌개"],
  );
});

test("검색어가 주재료 이름에 있으면 보유 여부와 상관없이 찾는다", async () => {
  const supabase = seededSupabase([]);

  const recipes = await buildRankedRecipeList(
    supabase,
    HOUSEHOLD,
    50,
    undefined,
    [],
    "두부",
  );

  assert.deepEqual(
    recipes.map((item) => item.name).sort(),
    ["돼지고기 김치찌개", "된장국", "두부조림"].sort(),
    "두부를 주재료로 쓰는 레시피 셋 다 나와야 한다",
  );
});

test("검색어와 맞는 레시피가 없으면 재고 샘플로 대체하지 않고 빈 배열이다", async () => {
  const supabase = seededSupabase([]);

  const recipes = await buildRankedRecipeList(
    supabase,
    HOUSEHOLD,
    50,
    undefined,
    [],
    "존재하지않는재료",
  );

  assert.deepEqual(recipes, []);
});

test("검색과 종류 필터를 같이 걸면 둘 다 만족하는 것만 남는다", async () => {
  const supabase = createFakeSupabase({
    inventory_item: [],
    recipe: [
      {
        id: "r-jjigae",
        source_api: "x",
        source_recipe_id: "r-jjigae",
        name: "두부김치찌개",
        image_url: null,
        instructions: [],
        calories: null,
        carbohydrate: null,
        protein: null,
        fat: null,
        sodium: null,
        category: "국&찌개",
        created_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "r-jorim",
        source_api: "x",
        source_recipe_id: "r-jorim",
        name: "두부조림",
        image_url: null,
        instructions: [],
        calories: null,
        carbohydrate: null,
        protein: null,
        fat: null,
        sodium: null,
        category: "반찬",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ],
    recipe_ingredient: [
      {
        id: "r-jjigae-m0",
        recipe_id: "r-jjigae",
        normalized_name: "두부",
        role: "main",
        is_whitelisted_seasoning: false,
      },
      {
        id: "r-jorim-m0",
        recipe_id: "r-jorim",
        normalized_name: "두부",
        role: "main",
        is_whitelisted_seasoning: false,
      },
    ],
  });

  const recipes = await buildRankedRecipeList(
    supabase,
    HOUSEHOLD,
    50,
    undefined,
    ["반찬"],
    "두부",
  );

  assert.deepEqual(
    recipes.map((item) => item.name),
    ["두부조림"],
  );
});

test("재고가 비어 있으면 목록이 통째로 비지 않도록 앞에서 몇 개를 보여준다", async () => {
  const supabase = seededSupabase([]);

  const recipes = await buildRankedRecipeList(supabase, HOUSEHOLD, 3);

  assert.equal(recipes.length, 3);
  assert.ok(recipes.every((item) => item.match.score === 0));
  assert.ok(recipes.every((item) => item.showMealKitCta === false));
});

// ---------------------------------------------------------------------------
// FR-05-01 — 요리함
// ---------------------------------------------------------------------------

test("체크리스트에는 이 레시피의 주재료 중 재고에 있는 것만 오른다", async () => {
  const supabase = seededSupabase(defaultInventory());

  const items = await buildCookChecklist(supabase, HOUSEHOLD, "r-kimchi");

  assert.deepEqual(
    items.map((item) => item.normalizedName),
    ["두부", "대파", "김치", "돼지고기"],
    "FIFO 순서 그대로",
  );
  assert.ok(items.every((item) => item.daysSincePurchase >= 0));
});

test("같은 재료를 여러 번 샀으면 가장 오래된 한 개만 체크리스트에 올린다", async () => {
  const supabase = seededSupabase([
    inventoryRow("inv-tofu-old", "두부", "2026-08-10"),
    inventoryRow("inv-tofu-new", "두부", "2026-08-18"),
    inventoryRow("inv-pa", "대파", "2026-08-12"),
  ]);

  const items = await buildCookChecklist(supabase, HOUSEHOLD, "r-tofu");

  assert.deepEqual(
    items.map((item) => item.inventoryItemId),
    ["inv-tofu-old", "inv-pa"],
  );
});

test("없는 레시피의 체크리스트는 null (404로 이어진다)", async () => {
  const supabase = seededSupabase(defaultInventory());
  assert.equal(await buildCookChecklist(supabase, HOUSEHOLD, "r-없음"), null);
});

test("요리함 처리는 받은 id만 소진하고 나머지는 남긴다", async () => {
  const supabase = seededSupabase(defaultInventory());

  // 대파는 안 썼다고 체크를 해제한 상황.
  const consumed = await consumeItemsForRecipe(supabase, HOUSEHOLD, [
    "inv-tofu",
    "inv-kimchi",
  ]);

  assert.equal(consumed, 2);
  const byId = Object.fromEntries(
    supabase.db.inventory_item.map((row) => [row.id, row]),
  );
  assert.equal(byId["inv-tofu"].status, "consumed");
  assert.equal(byId["inv-tofu"].consumed_via, "recipe_cooked");
  assert.equal(byId["inv-pa"].status, "in_stock");
  assert.equal(byId["inv-pa"].consumed_via, null);
  // 수량 차감은 없다 (FR-05-03).
  assert.equal(byId["inv-tofu"].quantity, "1개");
});

test("다른 가구 재고 id를 섞어 보내도 소진되지 않는다", async () => {
  const supabase = seededSupabase([
    ...defaultInventory(),
    inventoryRow("inv-other", "두부", "2026-08-10", OTHER_HOUSEHOLD),
  ]);

  const consumed = await consumeItemsForRecipe(supabase, HOUSEHOLD, [
    "inv-tofu",
    "inv-other",
  ]);

  assert.equal(consumed, 1);
  assert.equal(
    supabase.db.inventory_item.find((row) => row.id === "inv-other").status,
    "in_stock",
  );
});

test("이미 소진된 항목을 다시 보내도 0건일 뿐 실패가 아니다", async () => {
  const supabase = seededSupabase(defaultInventory());

  assert.equal(await consumeItemsForRecipe(supabase, HOUSEHOLD, ["inv-tofu"]), 1);
  assert.equal(await consumeItemsForRecipe(supabase, HOUSEHOLD, ["inv-tofu"]), 0);
  assert.equal(await consumeItemsForRecipe(supabase, HOUSEHOLD, []), 0);
});

// ---------------------------------------------------------------------------
// 레시피 북마크 — 가구가 공유하는 저장 목록
// ---------------------------------------------------------------------------

test("북마크가 없으면 빈 목록이다", async () => {
  const supabase = seededSupabase(defaultInventory());

  assert.deepEqual(await listBookmarkedRecipes(supabase, HOUSEHOLD), []);
});

test("최근에 담은 것부터 보여준다", async () => {
  const supabase = seededSupabase(defaultInventory(), [
    bookmarkRow("bm-1", "r-tofu", "2026-08-10T00:00:00.000Z"),
    bookmarkRow("bm-2", "r-kimchi", "2026-08-15T00:00:00.000Z"),
    bookmarkRow("bm-3", "r-egg", "2026-08-12T00:00:00.000Z"),
  ]);

  const bookmarks = await listBookmarkedRecipes(supabase, HOUSEHOLD);

  assert.deepEqual(
    bookmarks.map((item) => item.name),
    ["돼지고기 김치찌개", "계란말이", "두부조림"],
  );
});

test("다른 가구가 담은 건 안 보인다", async () => {
  const supabase = seededSupabase(defaultInventory(), [
    bookmarkRow("bm-1", "r-tofu", "2026-08-10T00:00:00.000Z", HOUSEHOLD),
    bookmarkRow("bm-2", "r-salmon", "2026-08-11T00:00:00.000Z", OTHER_HOUSEHOLD),
  ]);

  const bookmarks = await listBookmarkedRecipes(supabase, HOUSEHOLD);

  assert.deepEqual(
    bookmarks.map((item) => item.name),
    ["두부조림"],
  );
});

test("담은 뒤 레시피가 지워졌으면 조용히 목록에서 빠진다", async () => {
  const supabase = seededSupabase(defaultInventory(), [
    bookmarkRow("bm-1", "r-없음", "2026-08-10T00:00:00.000Z"),
    bookmarkRow("bm-2", "r-tofu", "2026-08-11T00:00:00.000Z"),
  ]);

  const bookmarks = await listBookmarkedRecipes(supabase, HOUSEHOLD);

  assert.deepEqual(
    bookmarks.map((item) => item.name),
    ["두부조림"],
  );
});

test("북마크한 레시피도 현재 재고 기준으로 매칭 정보를 다시 계산한다", async () => {
  const supabase = seededSupabase(defaultInventory(), [
    bookmarkRow("bm-1", "r-tofu", "2026-08-10T00:00:00.000Z"),
  ]);

  const [before] = await listBookmarkedRecipes(supabase, HOUSEHOLD);
  assert.equal(before.match.score, 1);

  const tofu = supabase.db.inventory_item.find((row) => row.id === "inv-tofu");
  tofu.status = "consumed";

  const [after] = await listBookmarkedRecipes(supabase, HOUSEHOLD);
  assert.deepEqual(after.match.missingMainIngredients, ["두부"]);
});

// ---------------------------------------------------------------------------
// 취향 신호 (추천 알고리즘 V2 Level 1)
// ---------------------------------------------------------------------------

function preferenceSupabase(rows) {
  return createFakeSupabase({
    recipe: CATALOG.map((entry) => entry.recipe),
    recipe_ingredient: CATALOG.flatMap((entry) => entry.ingredients),
    ...rows,
  });
}

test("좋아요는 그 레시피의 주재료를 선호 재료로 모은다", async () => {
  // r-doenjang = 된장국(두부, 애호박).
  const supabase = preferenceSupabase({
    recipe_preference: [preferenceRow("p-1", "r-doenjang", "like")],
  });

  const { preferredNames, dislikedNames } = await loadPreferenceSignals(
    supabase,
    HOUSEHOLD,
  );

  assert.deepEqual([...preferredNames].sort(), ["두부", "애호박"]);
  assert.deepEqual([...dislikedNames], []);
});

test("싫어요는 기피 재료로 모은다", async () => {
  const supabase = preferenceSupabase({
    recipe_preference: [preferenceRow("p-1", "r-salmon", "dislike")],
  });

  const { preferredNames, dislikedNames } = await loadPreferenceSignals(
    supabase,
    HOUSEHOLD,
  );

  assert.deepEqual([...dislikedNames].sort(), ["레몬", "연어"]);
  assert.deepEqual([...preferredNames], []);
});

test("보통은 선호에도 기피에도 안 들어간다", async () => {
  const supabase = preferenceSupabase({
    recipe_preference: [preferenceRow("p-1", "r-tofu", "neutral")],
  });

  const { preferredNames, dislikedNames } = await loadPreferenceSignals(
    supabase,
    HOUSEHOLD,
  );

  assert.deepEqual([...preferredNames], []);
  assert.deepEqual([...dislikedNames], []);
});

test("북마크와 요리 이력도 선호 신호로 합쳐진다", async () => {
  const supabase = preferenceSupabase({
    recipe_bookmark: [bookmarkRow("bm-1", "r-egg", "2026-08-01T00:00:00.000Z")],
    recipe_cook_log: [cookLogRow("cl-1", "r-doenjang", "2026-08-05T00:00:00.000Z")],
  });

  const { preferredNames } = await loadPreferenceSignals(supabase, HOUSEHOLD);

  // r-egg = 계란말이(계란, 대파, 당근 — 대파는 조미료 화이트리스트라 주재료에서
  // 빠진다), r-doenjang = 된장국(두부, 애호박).
  assert.deepEqual(
    [...preferredNames].sort(),
    ["계란", "당근", "두부", "애호박"],
  );
});

test("신호가 하나도 없으면 둘 다 빈 집합이다", async () => {
  const supabase = preferenceSupabase({});

  const { preferredNames, dislikedNames } = await loadPreferenceSignals(
    supabase,
    HOUSEHOLD,
  );

  assert.equal(preferredNames.size, 0);
  assert.equal(dislikedNames.size, 0);
});

test("다른 가구의 취향 신호는 안 섞인다", async () => {
  const supabase = preferenceSupabase({
    recipe_preference: [
      preferenceRow("p-1", "r-tofu", "like", HOUSEHOLD),
      preferenceRow("p-2", "r-salmon", "like", OTHER_HOUSEHOLD),
    ],
  });

  const { preferredNames } = await loadPreferenceSignals(supabase, HOUSEHOLD);

  assert.ok(!preferredNames.has("연어"), "다른 가구가 좋아요한 재료가 섞이면 안 된다");
});

test("요리함을 누르면 이력이 한 줄 남는다", async () => {
  const supabase = preferenceSupabase({});

  await logRecipeCooked(supabase, HOUSEHOLD, "r-tofu");

  assert.equal(supabase.db.recipe_cook_log.length, 1);
  assert.equal(supabase.db.recipe_cook_log[0].household_id, HOUSEHOLD);
  assert.equal(supabase.db.recipe_cook_log[0].recipe_id, "r-tofu");
});

test("같은 레시피를 여러 번 요리하면 이력이 그만큼 쌓인다", async () => {
  // 북마크(토글)와 달리 요리 이력은 반복을 그대로 세야 "자주 만든 메뉴"를 알 수 있다.
  const supabase = preferenceSupabase({});

  await logRecipeCooked(supabase, HOUSEHOLD, "r-tofu");
  await logRecipeCooked(supabase, HOUSEHOLD, "r-tofu");

  assert.equal(supabase.db.recipe_cook_log.length, 2);
});

// ---------------------------------------------------------------------------
// 취향 퀴즈 후보 (마이페이지 → 취향 설정)
// ---------------------------------------------------------------------------

function categorizedRecipeRow(id, name, category) {
  return {
    id,
    source_api: "foodsafetykorea_cookrcp01",
    source_recipe_id: id,
    name,
    image_url: null,
    instructions: [],
    calories: null,
    carbohydrate: null,
    protein: null,
    fat: null,
    sodium: null,
    category,
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

test("이미 평가한 레시피는 퀴즈 후보에서 빠진다", async () => {
  const supabase = createFakeSupabase({
    recipe: [
      categorizedRecipeRow("r-1", "김치찌개", "국&찌개"),
      categorizedRecipeRow("r-2", "된장찌개", "국&찌개"),
    ],
    recipe_preference: [preferenceRow("p-1", "r-1", "like")],
  });

  const candidates = await loadPreferenceQuizCandidates(supabase, HOUSEHOLD, 10);

  assert.ok(!candidates.some((card) => card.id === "r-1"));
  assert.ok(candidates.some((card) => card.id === "r-2"));
});

test("요청한 개수를 넘지 않는다", async () => {
  const supabase = createFakeSupabase({
    recipe: Array.from({ length: 20 }, (_, i) =>
      categorizedRecipeRow(`r-${i}`, `반찬 ${i}`, "반찬"),
    ),
  });

  const candidates = await loadPreferenceQuizCandidates(supabase, HOUSEHOLD, 6);

  assert.ok(candidates.length <= 6);
});

test("한 카테고리에만 있어도 다른 카테고리 후보가 없다고 실패하지 않는다", async () => {
  const supabase = createFakeSupabase({
    recipe: [categorizedRecipeRow("r-1", "반찬 하나", "반찬")],
  });

  const candidates = await loadPreferenceQuizCandidates(supabase, HOUSEHOLD, 24);

  assert.deepEqual(
    candidates.map((card) => card.id),
    ["r-1"],
  );
});
