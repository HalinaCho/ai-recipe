// 실행: node --test lib/meal-plan/nutrition.test.mjs
//
// FR-14-01의 null 처리를 고정한다.
//
// 이 테스트가 특히 필요한 이유: 현재 식약처 데이터 1,156건은 영양 컬럼이
// 전부 채워져 있어서 실데이터로는 null 경로가 **한 번도 안 밟힌다**. 즉
// 여기가 깨져도 지금 화면에서는 티가 안 난다. 레시피 출처가 늘거나 원본이
// 바뀌는 순간 조용히 "적게 먹는 주"로 표시되는 종류의 버그라, 실행 경로가
// 없는 지금 테스트로 붙들어 둔다.

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

const { summarizeWeeklyNutrition } = await import(
  "@/lib/meal-plan/nutrition.ts"
);

function meal(calories, carbohydrate, protein, fat, sodium) {
  return { calories, carbohydrate, protein, fat, sodium };
}

test("영양정보가 다 있으면 전 끼니가 합계에 반영된다", () => {
  const summary = summarizeWeeklyNutrition([
    meal(500, 60, 20, 15, 800),
    meal(300, 40, 10, 5, 400),
  ]);

  assert.equal(summary.calories, 800);
  assert.equal(summary.sodium, 1200);
  assert.equal(summary.coveredSlots, 2);
  assert.equal(summary.totalSlots, 2);
});

test("영양정보가 없는 끼니는 합계에서 빠지고 coveredSlots로 드러난다", () => {
  // 핵심: 총 끼니 수는 3인데 합계는 2끼분이다. coveredSlots가 없으면
  // 화면은 "3끼 먹고 800kcal"로 읽혀 실제보다 적게 먹은 것처럼 보인다.
  const summary = summarizeWeeklyNutrition([
    meal(500, 60, 20, 15, 800),
    meal(null, null, null, null, null),
    meal(300, 40, 10, 5, 400),
  ]);

  assert.equal(summary.calories, 800);
  assert.equal(summary.coveredSlots, 2);
  assert.equal(summary.totalSlots, 3);
});

test("일부 항목만 있으면 있는 것만 더하고 없는 항목을 0으로 채우지 않는다", () => {
  const summary = summarizeWeeklyNutrition([meal(500, null, 20, null, null)]);

  assert.equal(summary.calories, 500);
  assert.equal(summary.protein, 20);
  assert.equal(summary.carbohydrate, 0); // 더한 게 없어서 0이지 "0g을 먹었다"가 아니다
  assert.equal(summary.coveredSlots, 1); // 하나라도 있으면 반영된 끼니로 센다
});

test("전부 비어 있으면 coveredSlots가 0이다", () => {
  const summary = summarizeWeeklyNutrition([
    meal(null, null, null, null, null),
    null,
    undefined,
  ]);

  assert.equal(summary.coveredSlots, 0);
  assert.equal(summary.totalSlots, 3);
  assert.equal(summary.calories, 0);
});

test("칸이 없으면 0/0", () => {
  const summary = summarizeWeeklyNutrition([]);
  assert.equal(summary.coveredSlots, 0);
  assert.equal(summary.totalSlots, 0);
});

test("숫자가 아닌 값(NaN·문자열)은 합계를 오염시키지 않는다", () => {
  // 외부 API가 "-" 같은 값을 흘려보내면 합계가 통째로 NaN이 되어 화면에
  // NaN이 그대로 새는데, 그건 "정보 없음"보다 나쁘다.
  const summary = summarizeWeeklyNutrition([
    meal(500, 60, 20, 15, 800),
    meal(Number.NaN, "60", undefined, Number.POSITIVE_INFINITY, null),
  ]);

  assert.equal(summary.calories, 500);
  assert.equal(summary.carbohydrate, 60);
  assert.ok(Number.isFinite(summary.fat));
  assert.equal(summary.coveredSlots, 1);
});

test("부동소수 오차가 화면으로 새지 않게 소수점 한 자리로 자른다", () => {
  const summary = summarizeWeeklyNutrition([
    meal(0.1, 0, 0, 0, 0),
    meal(0.2, 0, 0, 0, 0),
  ]);

  assert.equal(summary.calories, 0.3); // 0.30000000000000004가 아니다
});
