// 실행: node --test lib/meal-plan/shopping-list.test.mjs
//
// FR-17-02·FR-17-03: 부족 재료를 재료 기준으로 묶는 규칙.
// 묶기가 틀려도 오류는 안 난다 — 대파가 두 줄로 나오거나, "2끼니"라고 써
// 놓고 실제로는 한 끼에만 쓰이는 식으로 조용히 어긋난다.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(import.meta.dirname, "../..");
function resolveSource(specifier, parentURL) {
  if (parentURL && parentURL.includes("/node_modules/")) return null;
  let base;
  if (specifier.startsWith("@/")) base = path.join(projectRoot, specifier.slice(2));
  else if (specifier.startsWith(".") && parentURL)
    base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  else return null;
  if (base.includes(`${path.sep}node_modules${path.sep}`)) return null;
  if (path.extname(base)) return existsSync(base) ? base : null;
  return [`${base}.ts`, path.join(base, "index.ts")].find((c) => existsSync(c)) ?? null;
}
registerHooks({
  resolve(specifier, context, next) {
    const resolved = resolveSource(specifier, context.parentURL);
    return resolved ? next(pathToFileURL(resolved).href, context) : next(specifier, context);
  },
});

const { buildShoppingList } = await import("@/lib/meal-plan/shopping-list.ts");

function slot(date, mealType, recipeName, missing) {
  return {
    id: `${date}-${mealType}`,
    date,
    mealType,
    isHoliday: false,
    holidayName: null,
    recipe: { id: `r-${recipeName}`, name: recipeName },
    matchScore: 0.5,
    missingMainIngredients: missing,
    outOfSeasonIngredients: [],
    source: "auto",
  };
}

test("같은 재료를 쓰는 끼니가 한 줄로 묶인다 (FR-17-03)", () => {
  const list = buildShoppingList([
    slot("2026-08-24", "dinner", "닭볶음탕", ["대파", "감자"]),
    slot("2026-08-25", "dinner", "파전", ["대파"]),
  ]);

  const green = list.find((i) => i.normalizedName === "대파");
  assert.equal(green.usedIn.length, 2);
  assert.deepEqual(
    green.usedIn.map((u) => u.recipeName),
    ["닭볶음탕", "파전"],
  );
  // 대파가 두 줄로 나오면 안 된다.
  assert.equal(list.filter((i) => i.normalizedName === "대파").length, 1);
});

test("여러 끼니에 쓰이는 재료가 위로 온다", () => {
  const list = buildShoppingList([
    slot("2026-08-24", "dinner", "A", ["감자", "대파"]),
    slot("2026-08-25", "dinner", "B", ["대파"]),
    slot("2026-08-26", "dinner", "C", ["대파"]),
  ]);
  assert.equal(list[0].normalizedName, "대파");
  assert.equal(list[0].usedIn.length, 3);
});

test("끼니 수가 같으면 이름순", () => {
  const list = buildShoppingList([
    slot("2026-08-24", "dinner", "A", ["오이", "가지", "당근"]),
  ]);
  assert.deepEqual(
    list.map((i) => i.normalizedName),
    ["가지", "당근", "오이"],
  );
});

test("부족한 재료가 없으면 빈 목록", () => {
  assert.deepEqual(buildShoppingList([slot("2026-08-24", "dinner", "A", [])]), []);
  assert.deepEqual(buildShoppingList([]), []);
});

test("제철이 아닌 재료에 딱지가 붙는다 (FR-13-07)", () => {
  // 감귤은 11~2월 제철 → 8월에는 사러 가면 안 된다.
  const list = buildShoppingList([
    slot("2026-08-24", "dinner", "감귤샐러드", ["감귤", "두부"]),
  ]);
  assert.equal(list.find((i) => i.normalizedName === "감귤").outOfSeason, true);
  assert.equal(list.find((i) => i.normalizedName === "두부").outOfSeason, false);
});

test("한 끼니라도 제철이면 딱지를 떼 준다", () => {
  // 12월 25일은 감귤 제철, 3월 2일은 아니다. 언제 사도 되는 재료를 계속
  // 경고하면 경고 자체가 무뎌진다.
  const list = buildShoppingList([
    slot("2026-12-25", "dinner", "A", ["감귤"]),
    slot("2027-03-02", "dinner", "B", ["감귤"]),
  ]);
  assert.equal(list[0].outOfSeason, false);
});

test("점심·저녁이 구분되어 남는다", () => {
  const list = buildShoppingList([
    slot("2026-08-29", "lunch", "A", ["두부"]),
    slot("2026-08-29", "dinner", "B", ["두부"]),
  ]);
  assert.deepEqual(
    list[0].usedIn.map((u) => u.mealType),
    ["lunch", "dinner"],
  );
});
