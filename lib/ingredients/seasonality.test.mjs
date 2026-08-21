// 실행: node --test lib/ingredients/seasonality.test.mjs
//
// FR-13-07 제철 판정.
//
// 이 테스트가 지키는 것은 두 방향이다. 하나는 "8월에 감귤을 사러 보내지 마라"이고,
// 다른 하나는 그보다 조용하고 위험한 쪽 — **연중 유통되는 재료를 계절 재료로
// 오인해 멀쩡한 레시피를 밀어내지 마라**이다. 후자는 화면상 아무 오류도 안 나고
// 그냥 "추천이 좀 이상하네"로만 보여서, 목록이 잘못 넓어져도 알아채기 어렵다.

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

const {
  SEASONAL_MONTHS,
  isInSeason,
  isSeasonalIngredient,
  monthOf,
  outOfSeasonPurchases,
  seasonPenaltyFactor,
} = await import("@/lib/ingredients/seasonality.ts");

// ---------------------------------------------------------------------------
// 기본 판정
// ---------------------------------------------------------------------------

test("감귤은 겨울에 제철이고 여름엔 아니다 (이 기능의 출발점)", () => {
  assert.equal(isInSeason("감귤", 12), true);
  assert.equal(isInSeason("감귤", 1), true);
  assert.equal(isInSeason("감귤", 8), false);
  assert.equal(isInSeason("귤", 8), false);
});

test("목록에 없는 재료는 언제나 제철이다", () => {
  // 모르면 통과가 기본값이다. 반대로 두면 목록에 없는 재료 전부가
  // 감점당해 후보가 통째로 마른다.
  for (const month of [1, 5, 8, 11]) {
    assert.equal(isInSeason("두부", month), true);
    assert.equal(isInSeason("계란", month), true);
    assert.equal(isInSeason("처음보는재료", month), true);
  }
});

test("여름 과일과 겨울 수산물이 반대로 걸리지 않는다", () => {
  assert.equal(isInSeason("수박", 7), true);
  assert.equal(isInSeason("수박", 1), false);
  assert.equal(isInSeason("굴", 1), true);
  assert.equal(isInSeason("굴", 7), false); // 산란기라 여름엔 안 먹는다
});

// ---------------------------------------------------------------------------
// 목록에 "들어가면 안 되는 것" — 이쪽이 조용한 실패다
// ---------------------------------------------------------------------------

test("말린 것·가공품은 계절 재료로 잡지 않는다", () => {
  // 곶감은 감을 말린 것이라 원물이 가을에 나도 연중 유통된다.
  // 이런 걸 "가을에만"으로 막으면 멀쩡한 레시피가 근거 없이 밀려난다.
  for (const name of [
    "곶감",
    "건포도",
    "건무화과",
    "고구마칩",
    "쑥가루",
    "매실장아찌",
    "김치",
    "배추김치",
    "백김치",
    "망고퓨레",
    "포도주스",
  ]) {
    assert.equal(
      isSeasonalIngredient(name),
      false,
      `${name}은(는) 가공·저장식품이라 계절을 타지 않아야 한다`,
    );
  }
});

test("건조 해조류·건어물은 계절 재료가 아니다", () => {
  for (const name of ["김", "김가루", "다시마", "멸치", "미역", "미역줄기"]) {
    assert.equal(isSeasonalIngredient(name), false, `${name} 오탐`);
  }
});

test("저장·시설재배로 연중 나오는 채소는 계절 재료가 아니다", () => {
  for (const name of [
    "감자",
    "고구마",
    "양파",
    "배추",
    "양배추",
    "부추",
    "시금치",
    "가지",
    "애호박",
    "단호박",
  ]) {
    assert.equal(isSeasonalIngredient(name), false, `${name} 오탐`);
  }
});

test("재배 버섯은 계절을 타지 않는다", () => {
  for (const name of [
    "표고버섯",
    "양송이버섯",
    "새송이버섯",
    "만송이버섯",
    "백일송이버섯",
  ]) {
    assert.equal(isSeasonalIngredient(name), false, `${name} 오탐`);
  }
});

test("수입 과일은 계절 재료가 아니다", () => {
  for (const name of ["망고", "바나나", "파인애플", "오렌지"]) {
    assert.equal(isSeasonalIngredient(name), false, `${name} 오탐`);
  }
});

// ---------------------------------------------------------------------------
// 목록 자체의 건전성
// ---------------------------------------------------------------------------

test("모든 항목의 달은 1~12 범위이고 비어 있지 않다", () => {
  for (const [name, months] of Object.entries(SEASONAL_MONTHS)) {
    assert.ok(months.length > 0, `${name}: 달이 비었다`);
    assert.ok(months.length < 12, `${name}: 12달 전부면 계절 재료가 아니다`);
    for (const month of months) {
      assert.ok(
        Number.isInteger(month) && month >= 1 && month <= 12,
        `${name}: ${month}은 달이 아니다`,
      );
    }
    assert.equal(new Set(months).size, months.length, `${name}: 달 중복`);
  }
});

test("목록의 이름은 실제 레시피 어휘에 존재한다", async () => {
  // 어휘에 없는 이름을 적어 두면 영원히 안 걸리는 죽은 규칙이 된다.
  const { readFileSync } = await import("node:fs");
  const vocabulary = JSON.parse(
    readFileSync(
      path.join(projectRoot, "lib/ingredients/recipe-vocabulary.json"),
      "utf8",
    ),
  );
  const known = new Set(vocabulary.all ?? vocabulary.main ?? vocabulary);

  const missing = Object.keys(SEASONAL_MONTHS).filter(
    (name) => !known.has(name),
  );
  assert.deepEqual(missing, [], `어휘에 없는 이름: ${missing.join(", ")}`);
});

// ---------------------------------------------------------------------------
// 보유 재료 예외 — 이 기능의 핵심 설계
// ---------------------------------------------------------------------------

test("사야 하는 재료만 제철을 따진다 (보유 재료는 예외)", () => {
  // 8월 냉장고에 감귤이 있으면 그건 먹어 없애야 할 재고지 말려야 할 구매가
  // 아니다. missing 목록에만 감귤이 없으면 감점 대상이 아니어야 한다.
  assert.deepEqual(outOfSeasonPurchases([], 8), []);
  assert.deepEqual(outOfSeasonPurchases(["감귤"], 8), ["감귤"]);
  assert.deepEqual(outOfSeasonPurchases(["감귤"], 12), []);
});

test("보유 중인 제철 아닌 재료는 점수를 깎지 않는다", () => {
  const mains = ["감귤", "두부"];
  // 감귤을 갖고 있어 missing이 비었다 → 감점 없음
  assert.equal(seasonPenaltyFactor(mains, [], 8), 1);
  // 감귤을 사야 한다 → 감점
  assert.ok(seasonPenaltyFactor(mains, ["감귤"], 8) < 1);
});

// ---------------------------------------------------------------------------
// 감점 계수
// ---------------------------------------------------------------------------

test("제철 아닌 재료 비율만큼 깎이고 0~1을 벗어나지 않는다", () => {
  // 주재료 2개 중 1개가 제철 아님 → 1 - 0.5×0.7 = 0.65
  assert.equal(
    Number(seasonPenaltyFactor(["감귤", "두부"], ["감귤"], 8).toFixed(4)),
    0.65,
  );
  // 전부 제철 아님 → 1 - 1×0.7 = 0.3
  // 4월은 감귤(11~2월)도 수박(6~8월)도 아닌 달이다. 1월로 잡으면 감귤이
  // 제철이라 절반만 걸린다 — 달을 고를 때 실제로 겹치는지 확인해야 한다.
  assert.equal(
    Number(seasonPenaltyFactor(["감귤", "수박"], ["감귤", "수박"], 4).toFixed(4)),
    0.3,
  );
  // 완전 배제(0)가 아닌 이유: FR-13-03이 빈 칸을 금지한다.
  assert.ok(seasonPenaltyFactor(["감귤"], ["감귤"], 8) > 0);
});

test("주재료가 없으면 감점하지 않는다", () => {
  assert.equal(seasonPenaltyFactor([], [], 8), 1);
});

test("monthOf는 YYYY-MM-DD에서 달을 뽑는다", () => {
  assert.equal(monthOf("2026-08-21"), 8);
  assert.equal(monthOf("2026-01-04"), 1);
  assert.equal(monthOf("2026-12-31"), 12);
});
