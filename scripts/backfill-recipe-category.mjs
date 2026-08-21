// 실행: node scripts/backfill-recipe-category.mjs
//
// FR-13-06: 이미 수집된 레시피에 요리종류(RCP_PAT2)·조리방법(RCP_WAY2)을 채운다.
//
// 왜 재수집(POST /api/admin/ingest-recipes)이 아니라 별도 스크립트인가:
// 재수집은 레시피 재료를 LLM으로 다시 구조화하는 과정을 포함한다(FR-07-01).
// 1,156건을 다시 태우면 비용도 크고, 무엇보다 **이미 잘 정리된 재료 데이터를
// 다시 뽑아 결과가 달라질 위험**이 있다. 지금 필요한 것은 컬럼 두 개를
// 채우는 일뿐이라, 소스에서 그 두 필드만 읽어 원본 id로 맞춰 넣는다.
//
// 멱등하다 — 몇 번 돌려도 같은 값으로 덮어쓴다.

import { readFileSync } from "node:fs";

const SOURCE_API = "foodsafetykorea_cookrcp01";

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const FOOD_KEY = env.FOODSAFETYKOREA_API_KEY;

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  FOODSAFETYKOREA_API_KEY: FOOD_KEY,
})) {
  if (!value || value.includes("your-") || value.endsWith("-here")) {
    console.error(`${name}가 비었거나 플레이스홀더입니다.`);
    process.exit(1);
  }
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

/** 식약처에서 id → {category, cookingMethod} 를 전부 읽는다. */
async function fetchSourceCategories() {
  const byId = new Map();
  // 한 번에 1000행이 상한이라 두 번에 나눠 받는다 (전체 1,156건).
  for (const [start, end] of [
    [1, 1000],
    [1001, 2000],
  ]) {
    const url = `https://openapi.foodsafetykorea.go.kr/api/${FOOD_KEY}/COOKRCP01/json/${start}/${end}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`식약처 응답 ${response.status}`);
    const body = await response.json();
    const rows = body?.COOKRCP01?.row ?? [];
    for (const row of rows) {
      const id = (row.RCP_SEQ ?? "").trim();
      if (!id) continue;
      byId.set(id, {
        category: (row.RCP_PAT2 ?? "").trim() || null,
        cookingMethod: (row.RCP_WAY2 ?? "").trim() || null,
      });
    }
    if (rows.length === 0) break;
  }
  return byId;
}

/** PostgREST는 한 번에 1000행만 준다 — 끝까지 이어 받는다. */
async function fetchAllRecipeRows() {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/recipe?select=id,source_recipe_id,category&source_api=eq.${SOURCE_API}&order=id.asc`,
      { headers: { ...headers, Range: `${from}-${from + PAGE - 1}` } },
    );
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

const source = await fetchSourceCategories();
console.log(`식약처에서 분류 ${source.size}건 확보`);

const rows = await fetchAllRecipeRows();
console.log(`DB 레시피 ${rows.length}건`);

const updates = [];
let unmatched = 0;
for (const row of rows) {
  const found = source.get(row.source_recipe_id);
  if (!found) {
    unmatched += 1;
    continue;
  }
  updates.push({ id: row.id, ...found });
}

if (unmatched > 0) {
  // 소스에서 사라진 레시피는 그냥 category가 null로 남는다 — isMealSuitable이
  // null을 끼니로 보므로 식단표에서 빠지지는 않는다.
  console.log(`소스에 없는 레시피 ${unmatched}건은 건너뜁니다`);
}

// 한 행씩 PATCH하면 1,156번 왕복이라 느리다. upsert로 묶어 보내되,
// id를 명시하므로 기존 행을 갱신한다 (다른 컬럼은 건드리지 않게 merge-duplicates).
const CHUNK = 200;
let done = 0;
for (let start = 0; start < updates.length; start += CHUNK) {
  const chunk = updates.slice(start, start + CHUNK);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/recipe?on_conflict=id`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(
      chunk.map((item) => ({
        id: item.id,
        category: item.category,
        cooking_method: item.cookingMethod,
      })),
    ),
  });
  if (!response.ok) throw new Error(await response.text());
  done += chunk.length;
  process.stdout.write(`\r  갱신 ${done}/${updates.length}`);
}
console.log();

// 결과 확인 — 분류별 건수를 세어 보여준다.
const counts = new Map();
for (const item of updates) {
  counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
}
console.log("\n분류별 건수:");
for (const [category, count] of [...counts].sort((a, b) => b[1] - a[1])) {
  const mark = category === "후식" ? "  ← 끼니 후보에서 제외됨 (FR-13-06)" : "";
  console.log(`  ${category ?? "(없음)"}: ${count}${mark}`);
}
