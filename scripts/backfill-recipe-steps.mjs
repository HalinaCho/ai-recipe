// 실행: node scripts/backfill-recipe-steps.mjs
//
// FR-06-03: 이미 수집된 레시피의 조리 단계에 사진을 채운다.
//
// 우리는 MANUAL01~20(글)만 가져오고 MANUAL_IMG01~20(사진)을 버리고 있었다.
// 확인해 보니 조리단계 6,717개가 **전부** 사진을 갖고 있었다 — 자료가 있는데
// 안 쓰고 있었던 것이다.
//
// 재수집(POST /api/admin/ingest-recipes) 대신 별도 스크립트인 이유는
// backfill-recipe-category.mjs와 같다: 재수집은 재료를 LLM으로 다시
// 구조화하므로 비용이 크고, 잘 정리된 재료 데이터가 달라질 위험이 있다.
//
// 멱등하다 — 몇 번 돌려도 같은 값이 된다.

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

/** http로 오는 원본을 https로. 안 그러면 브라우저가 혼합 콘텐츠로 막는다. */
function toHttps(url) {
  return url.startsWith("http://") ? `https://${url.slice(7)}` : url;
}

/** lib/recipes/foodsafetykorea.ts의 parseInstructions와 같은 규칙. */
function parseSteps(row) {
  const steps = [];
  for (let i = 1; i <= 20; i += 1) {
    const suffix = String(i).padStart(2, "0");
    const raw = row[`MANUAL${suffix}`];
    if (typeof raw !== "string") continue;

    const text = raw
      .replace(/\r/g, "")
      .trim()
      .replace(/^\d+\s*[.)]\s*/, "")
      .replace(/(?<=[가-힣.)\]])\s*[a-zA-Z]$/, "")
      .trim();
    if (!text) continue;

    const image = (row[`MANUAL_IMG${suffix}`] ?? "").trim();
    steps.push({ text, imageUrl: image ? toHttps(image) : null });
  }
  return steps;
}

async function fetchSourceSteps() {
  const byId = new Map();
  for (const [start, end] of [
    [1, 1000],
    [1001, 2000],
  ]) {
    const response = await fetch(
      `https://openapi.foodsafetykorea.go.kr/api/${FOOD_KEY}/COOKRCP01/json/${start}/${end}`,
    );
    if (!response.ok) throw new Error(`식약처 응답 ${response.status}`);
    const rows = (await response.json())?.COOKRCP01?.row ?? [];
    for (const row of rows) {
      const id = (row.RCP_SEQ ?? "").trim();
      if (!id) continue;
      byId.set(id, parseSteps(row));
    }
    if (rows.length === 0) break;
  }
  return byId;
}

async function fetchAllRecipeRows() {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/recipe?select=id,source_recipe_id&source_api=eq.${SOURCE_API}&order=id.asc`,
      { headers: { ...headers, Range: `${from}-${from + PAGE - 1}` } },
    );
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json();
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

const source = await fetchSourceSteps();
console.log(`식약처에서 조리단계 확보: ${source.size}건`);

const rows = await fetchAllRecipeRows();
console.log(`DB 레시피 ${rows.length}건`);

// 조리 단계는 레시피마다 내용이 달라 묶어서 PATCH할 수 없다. 한 건씩 보내되
// 동시에 여러 개를 띄워 왕복 시간을 줄인다. 공공 API가 아니라 우리 DB를
// 때리는 것이라 병렬도를 과하게 올릴 이유는 없다.
const CONCURRENCY = 8;
let done = 0;
let skipped = 0;
let stepsWithImage = 0;
let stepsTotal = 0;

async function updateOne(row) {
  const steps = source.get(row.source_recipe_id);
  if (!steps || steps.length === 0) {
    skipped += 1;
    return;
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/recipe?id=eq.${row.id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ instructions: steps }),
  });
  if (!response.ok) throw new Error(await response.text());

  stepsTotal += steps.length;
  stepsWithImage += steps.filter((step) => step.imageUrl).length;
  done += 1;
  if (done % 50 === 0) {
    process.stdout.write(`\r  갱신 ${done}/${rows.length}`);
  }
}

for (let start = 0; start < rows.length; start += CONCURRENCY) {
  await Promise.all(rows.slice(start, start + CONCURRENCY).map(updateOne));
}
console.log(`\r  갱신 ${done}/${rows.length}`);

if (skipped > 0) {
  console.log(`소스에 단계가 없어 건너뛴 레시피: ${skipped}건`);
}
console.log(
  `\n조리단계 ${stepsTotal}개 중 사진 있는 것 ${stepsWithImage}개 ` +
    `(${Math.round((stepsWithImage / stepsTotal) * 100)}%)`,
);
