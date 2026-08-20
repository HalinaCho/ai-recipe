// 실행: node --test lib/recipes/ingest/run.test.mjs
//
// 가짜 소스 + 가짜 구조화기 + 인메모리 Supabase로 수집 배치를 돌린다.
// 네트워크도, LLM 호출도 없다.

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

const { runRecipeIngestion } = await import("@/lib/recipes/ingest/run.ts");
const { sanitizeStructuredBatch } = await import(
  "@/lib/recipes/ingest/structure-ingredients.ts"
);

const SOURCE_API = "test_source";

// ---------------------------------------------------------------------------
// 인메모리 Supabase — run.ts가 실제로 쓰는 체인만 흉내 낸다.
// ---------------------------------------------------------------------------

function createFakeSupabase() {
  const db = { recipe: [], recipe_ingredient: [] };
  let autoId = 0;

  function matches(row, filters) {
    return filters.every(([column, value]) => row[column] === value);
  }

  function run(state) {
    const rows = db[state.table];

    if (state.op === "select") {
      let selected = rows.filter((row) => matches(row, state.filters));
      if (state.inFilter) {
        const [column, values] = state.inFilter;
        selected = selected.filter((row) => values.includes(row[column]));
      }
      return { data: selected.map((row) => ({ ...row })), error: null };
    }

    if (state.op === "insert") {
      for (const record of state.payload) {
        rows.push({ id: `row-${(autoId += 1)}`, ...record });
      }
      return { data: null, error: null };
    }

    if (state.op === "upsert") {
      const written = [];
      for (const record of state.payload) {
        // unique (source_api, source_recipe_id)
        const existing = rows.find(
          (row) =>
            row.source_api === record.source_api &&
            row.source_recipe_id === record.source_recipe_id,
        );
        if (existing) {
          Object.assign(existing, record);
          written.push({ ...existing });
        } else {
          const inserted = { id: `recipe-${(autoId += 1)}`, ...record };
          rows.push(inserted);
          written.push({ ...inserted });
        }
      }
      return { data: written, error: null };
    }

    if (state.op === "delete") {
      const [column, values] = state.inFilter ?? [null, []];
      db[state.table] = rows.filter(
        (row) => !(column && values.includes(row[column])),
      );
      return { data: null, error: null };
    }

    throw new Error(`unsupported op: ${state.op}`);
  }

  function from(table) {
    const state = {
      table,
      op: "select",
      filters: [],
      inFilter: null,
      payload: null,
    };
    const builder = {
      select: () => builder,
      eq(column, value) {
        state.filters.push([column, value]);
        return builder;
      },
      in(column, values) {
        state.inFilter = [column, values];
        return builder;
      },
      insert(payload) {
        state.op = "insert";
        state.payload = Array.isArray(payload) ? payload : [payload];
        return builder;
      },
      upsert(payload) {
        state.op = "upsert";
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

function rawRecipe(id, overrides = {}) {
  return {
    sourceRecipeId: id,
    name: `레시피 ${id}`,
    imageUrl: `https://example.test/${id}.png`,
    instructions: ["재료를 손질한다.", "볶는다."],
    ingredientsText: "돼지고기 300g, 두부 1모, 간장 2큰술",
    nutrition: { calories: 100, carbohydrate: 1, protein: 2, fat: 3, sodium: 4 },
    ...overrides,
  };
}

function fakeSource(pages) {
  return {
    sourceApi: SOURCE_API,
    async fetchPage(offset, limit) {
      return pages.slice(offset, offset + limit);
    },
  };
}

/** 항상 같은 결과를 내는 가짜 구조화기. 호출된 레시피 ID를 기록한다. */
function fakeStructure(calls, byId = {}) {
  return async (inputs) => {
    calls.push(inputs.map((input) => input.sourceRecipeId));
    return new Map(
      inputs.map((input) => [
        input.sourceRecipeId,
        byId[input.sourceRecipeId] ?? [
          { normalizedName: "돼지고기", role: "main" },
          { normalizedName: "두부", role: "main" },
          { normalizedName: "간장", role: "seasoning" },
        ],
      ]),
    );
  };
}

// ---------------------------------------------------------------------------

test("레시피와 재료를 쓰고, 화이트리스트 조미료를 표시한다", async () => {
  const supabase = createFakeSupabase();
  const calls = [];

  const report = await runRecipeIngestion(supabase, {
    deps: { source: fakeSource([rawRecipe("1"), rawRecipe("2")]), structure: fakeStructure(calls) },
  });

  assert.equal(report.fetched, 2);
  assert.equal(report.written, 2);
  assert.equal(report.structured, 2);
  assert.equal(report.failed, 0);
  assert.equal(report.done, true);
  assert.equal(supabase.db.recipe.length, 2);
  assert.equal(supabase.db.recipe_ingredient.length, 6);

  const soy = supabase.db.recipe_ingredient.find(
    (row) => row.normalized_name === "간장",
  );
  assert.equal(soy.role, "seasoning");
  assert.equal(soy.is_whitelisted_seasoning, true);

  const pork = supabase.db.recipe_ingredient.find(
    (row) => row.normalized_name === "돼지고기",
  );
  assert.equal(pork.is_whitelisted_seasoning, false);
});

test("다시 돌려도 중복되지 않고 LLM을 다시 부르지 않는다", async () => {
  const supabase = createFakeSupabase();
  const pages = [rawRecipe("1"), rawRecipe("2")];

  const first = [];
  await runRecipeIngestion(supabase, {
    deps: { source: fakeSource(pages), structure: fakeStructure(first) },
  });

  const second = [];
  const report = await runRecipeIngestion(supabase, {
    deps: {
      source: fakeSource([rawRecipe("1", { name: "이름이 바뀐 레시피" }), rawRecipe("2")]),
      structure: fakeStructure(second),
    },
  });

  assert.deepEqual(second, []); // LLM 호출 없음
  assert.equal(report.skipped, 2);
  assert.equal(report.structured, 0);
  assert.equal(supabase.db.recipe.length, 2);
  assert.equal(supabase.db.recipe_ingredient.length, 6);
  // 메타데이터는 최신으로 덮인다.
  assert.equal(
    supabase.db.recipe.find((row) => row.source_recipe_id === "1").name,
    "이름이 바뀐 레시피",
  );
});

test("force면 재료를 갈아 끼운다", async () => {
  const supabase = createFakeSupabase();
  const pages = [rawRecipe("1")];

  await runRecipeIngestion(supabase, {
    deps: { source: fakeSource(pages), structure: fakeStructure([]) },
  });

  const calls = [];
  await runRecipeIngestion(supabase, {
    force: true,
    deps: {
      source: fakeSource(pages),
      structure: fakeStructure(calls, {
        1: [{ normalizedName: "닭고기", role: "main" }],
      }),
    },
  });

  assert.deepEqual(calls, [["1"]]);
  assert.deepEqual(
    supabase.db.recipe_ingredient.map((row) => row.normalized_name),
    ["닭고기"],
  );
});

test("offset과 limit으로 이어서 돌 수 있다", async () => {
  const supabase = createFakeSupabase();
  const pages = ["1", "2", "3", "4", "5"].map((id) => rawRecipe(id));

  const first = await runRecipeIngestion(supabase, {
    limit: 2,
    pageSize: 2,
    deps: { source: fakeSource(pages), structure: fakeStructure([]) },
  });
  assert.equal(first.fetched, 2);
  assert.equal(first.nextOffset, 2);
  assert.equal(first.done, false);

  const second = await runRecipeIngestion(supabase, {
    offset: first.nextOffset,
    limit: 10,
    pageSize: 2,
    deps: { source: fakeSource(pages), structure: fakeStructure([]) },
  });
  assert.equal(second.fetched, 3);
  assert.equal(second.done, true);
  assert.equal(supabase.db.recipe.length, 5);
});

test("한 배치가 죽어도 다른 배치는 계속 간다", async () => {
  const supabase = createFakeSupabase();
  const pages = ["1", "2", "3", "4"].map((id) => rawRecipe(id));

  let call = 0;
  const structure = async (inputs) => {
    call += 1;
    if (call === 1) throw new Error("rate limited");
    return new Map(
      inputs.map((input) => [
        input.sourceRecipeId,
        [{ normalizedName: "두부", role: "main" }],
      ]),
    );
  };

  const report = await runRecipeIngestion(supabase, {
    batchSize: 2,
    deps: { source: fakeSource(pages), structure },
  });

  assert.equal(report.failed, 2);
  assert.equal(report.structured, 2);
  // 실패한 레시피도 recipe 행은 남아 다음 실행에서 재료만 다시 시도된다.
  assert.equal(supabase.db.recipe.length, 4);
  assert.equal(supabase.db.recipe_ingredient.length, 2);
});

test("재료 텍스트가 비면 LLM을 부르지 않고 실패로 센다", async () => {
  const supabase = createFakeSupabase();
  const calls = [];

  const report = await runRecipeIngestion(supabase, {
    deps: {
      source: fakeSource([rawRecipe("1", { ingredientsText: "" })]),
      structure: fakeStructure(calls),
    },
  });

  assert.deepEqual(calls, []);
  assert.equal(report.failed, 1);
  assert.equal(report.written, 1);
});

// ---------------------------------------------------------------------------
// 응답 정리 (LLM 없이)
// ---------------------------------------------------------------------------

const INPUTS = [
  { sourceRecipeId: "1", name: "a", ingredientsText: "..." },
  { sourceRecipeId: "2", name: "b", ingredientsText: "..." },
];

test("요청하지 않은 ID와 빈 재료는 버린다", () => {
  const result = sanitizeStructuredBatch(
    {
      recipes: [
        { sourceRecipeId: "1", ingredients: [{ normalizedName: "두부", role: "main" }] },
        { sourceRecipeId: "2", ingredients: [] },
        { sourceRecipeId: "999", ingredients: [{ normalizedName: "김치", role: "main" }] },
      ],
    },
    INPUTS,
  );

  assert.deepEqual([...result.keys()], ["1"]);
});

test("화이트리스트 조미료는 main으로 와도 seasoning으로 고친다", () => {
  const result = sanitizeStructuredBatch(
    {
      recipes: [
        {
          sourceRecipeId: "1",
          ingredients: [
            { normalizedName: "참기름", role: "main" },
            { normalizedName: "돼지고기", role: "main" },
          ],
        },
      ],
    },
    INPUTS,
  );

  assert.deepEqual(result.get("1"), [
    { normalizedName: "참기름", role: "seasoning" },
    { normalizedName: "돼지고기", role: "main" },
  ]);
});

test("중복 재료는 하나로 합치고 주재료를 살린다", () => {
  const result = sanitizeStructuredBatch(
    {
      recipes: [
        {
          sourceRecipeId: "1",
          ingredients: [
            { normalizedName: "대파", role: "seasoning" },
            { normalizedName: "대파", role: "main" },
          ],
        },
      ],
    },
    INPUTS,
  );

  assert.deepEqual(result.get("1"), [{ normalizedName: "대파", role: "main" }]);
});

test("수량이 남은 이름과 구획 표시는 재료가 아니다", () => {
  const result = sanitizeStructuredBatch(
    {
      recipes: [
        {
          sourceRecipeId: "1",
          ingredients: [
            { normalizedName: "양념장", role: "seasoning" },
            { normalizedName: "두부 300g", role: "main" },
            { normalizedName: "연두부(3/4모)", role: "main" },
          ],
        },
      ],
    },
    INPUTS,
  );

  assert.deepEqual(result.get("1"), [{ normalizedName: "연두부", role: "main" }]);
});

test("응답이 배열이 아니면 아무것도 통과시키지 않는다", () => {
  assert.equal(sanitizeStructuredBatch(null, INPUTS).size, 0);
  assert.equal(sanitizeStructuredBatch({ recipes: "nope" }, INPUTS).size, 0);
});
