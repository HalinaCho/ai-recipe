// 실행: node --test lib/recipes/matching/score.test.mjs
//
// FR-08-01 공식을 숫자로 고정한다. 가중치는 실사용 후 튜닝 대상이라,
// "무엇이 바뀌면 안 되는지"(분모에서 조미료 제외, 0/0 방어, 소진임박이
// 순위를 뒤집는다)를 테스트가 붙들고 있어야 안심하고 값을 만질 수 있다.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// 번들러가 해주던 두 가지를 테스트 러너에서 대신한다: tsconfig의 "@/*" 별칭과
// 확장자 없는 상대 경로. 정적 import는 훅이 돌기 전에 해석되므로, 대상
// 모듈은 아래에서 동적으로 불러온다.
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

const { DEFAULT_MATCHING_CONFIG } = await import(
  "@/lib/recipes/matching/config.ts"
);
const {
  mainIngredientNames,
  rankRecipes,
  scoreRecipe,
  selectExpiringNames,
  showsMealKitCta,
} = await import("@/lib/recipes/matching/score.ts");

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function main(...names) {
  return names.map((normalizedName) => ({
    normalizedName,
    role: "main",
    isWhitelistedSeasoning: false,
  }));
}

function seasoning(...names) {
  return names.map((normalizedName) => ({
    normalizedName,
    role: "seasoning",
    isWhitelistedSeasoning: true,
  }));
}

function recipe(name, ingredients) {
  return { id: `recipe-${name}`, name, imageUrl: null, calories: null, ingredients };
}

/** 재고는 FIFO(오래된 순)로 들어온다고 본다 — listInStockItems와 같은 순서. */
function fifo(...names) {
  return names.map((normalizedName) => ({ normalizedName }));
}

function owned(...names) {
  return new Set(names);
}

const NONE = new Set();

// ---------------------------------------------------------------------------

test("주재료를 다 가지고 있으면 매칭률 1", () => {
  const match = scoreRecipe(
    recipe("계란말이", [...main("계란", "대파", "당근"), ...seasoning("소금")]),
    owned("계란", "대파", "당근"),
    NONE,
  );

  assert.equal(match.matchRate, 1);
  assert.equal(match.score, DEFAULT_MATCHING_CONFIG.weights.availability);
  assert.deepEqual(match.missingMainIngredients, []);
  assert.deepEqual(match.ownedMainIngredients, ["계란", "대파", "당근"]);
});

test("주재료가 하나도 없으면 0점이고 전부 부족 재료로 나온다", () => {
  const match = scoreRecipe(
    recipe("연어스테이크", main("연어", "레몬", "아스파라거스")),
    owned("우유"),
    NONE,
  );

  assert.equal(match.score, 0);
  assert.equal(match.matchRate, 0);
  assert.deepEqual(match.missingMainIngredients, [
    "연어",
    "레몬",
    "아스파라거스",
  ]);
});

test("부분 매칭도 점수를 받고 부족 재료가 따로 나온다 (FR-08-02)", () => {
  const match = scoreRecipe(
    recipe("김치찌개", main("돼지고기", "김치", "두부", "대파")),
    owned("김치", "두부"),
    NONE,
  );

  assert.equal(match.matchRate, 0.5);
  assert.equal(match.score, 0.5 * DEFAULT_MATCHING_CONFIG.weights.availability);
  assert.deepEqual(match.ownedMainIngredients, ["김치", "두부"]);
  assert.deepEqual(match.missingMainIngredients, ["돼지고기", "대파"]);
});

test("조미료는 분모에서 빠진다 — 간장이 없어도 매칭률은 1 (FR-07-02)", () => {
  const withSeasonings = recipe("두부조림", [
    ...main("두부"),
    ...seasoning("간장", "설탕", "고춧가루", "참기름"),
  ]);

  assert.deepEqual(mainIngredientNames(withSeasonings), ["두부"]);
  assert.equal(scoreRecipe(withSeasonings, owned("두부"), NONE).matchRate, 1);
});

test("수집이 조미료를 주재료로 잘못 분류해도 런타임 화이트리스트가 걸러낸다", () => {
  // role은 main, is_whitelisted_seasoning은 false로 들어온 상황.
  const misclassified = recipe("제육볶음", main("돼지고기", "간장", "다진마늘"));

  assert.deepEqual(mainIngredientNames(misclassified), ["돼지고기"]);
  assert.equal(scoreRecipe(misclassified, owned("돼지고기"), NONE).matchRate, 1);
});

test("조미료만 있는 레시피는 1.0이 아니라 0점이다", () => {
  const match = scoreRecipe(
    recipe("양념장", seasoning("간장", "설탕", "참기름")),
    owned("간장", "설탕", "참기름"),
    owned("간장"),
  );

  assert.equal(match.score, 0);
  assert.equal(match.matchRate, 0);
  assert.deepEqual(match.ownedMainIngredients, []);
  assert.deepEqual(match.usesExpiringIngredients, []);
});

test("재료 행이 아예 없는 레시피도 0으로 나누지 않는다", () => {
  const match = scoreRecipe(recipe("수집중", []), owned("두부"), owned("두부"));

  assert.equal(match.score, 0);
  assert.equal(match.matchRate, 0);
  assert.ok(Number.isFinite(match.score));
});

test("같은 재료가 두 번 적혀도 분모는 한 번만 센다", () => {
  const duplicated = recipe("대파듬뿍국", main("대파", "대파", "두부"));

  assert.deepEqual(mainIngredientNames(duplicated), ["대파", "두부"]);
  assert.equal(scoreRecipe(duplicated, owned("대파", "두부"), NONE).matchRate, 1);
});

// ---------------------------------------------------------------------------
// 소진임박 TOP N (FR-04-02 FIFO)
// ---------------------------------------------------------------------------

test("소진임박 TOP N은 FIFO 앞에서 서로 다른 재료명으로 N개", () => {
  const names = selectExpiringNames(
    fifo("두부", "두부", "대파", "김치", "우유", "계란", "당근"),
    { ...DEFAULT_MATCHING_CONFIG, expiringTopN: 3 },
  );

  // 두부를 두 번 샀다고 TOP N 자리를 두 칸 먹지 않는다.
  assert.deepEqual([...names], ["두부", "대파", "김치"]);
});

test("재고가 N보다 적으면 있는 만큼만 임박으로 본다", () => {
  const names = selectExpiringNames(fifo("두부"), DEFAULT_MATCHING_CONFIG);
  assert.deepEqual([...names], ["두부"]);
});

test("소진임박 재료를 쓰면 점수가 올라간다", () => {
  const 김치찌개 = recipe("김치찌개", main("김치", "두부"));
  const both = owned("김치", "두부");

  const withoutBonus = scoreRecipe(김치찌개, both, NONE);
  const withBonus = scoreRecipe(김치찌개, both, owned("김치", "두부"));

  assert.equal(withoutBonus.score, 0.6);
  assert.equal(withBonus.score, 1);
  assert.deepEqual(withBonus.usesExpiringIngredients, ["김치", "두부"]);
});

test("소진임박 보너스가 실제로 순위를 바꾼다", () => {
  const 계란말이 = recipe("계란말이", main("계란", "당근"));
  const 두부조림 = recipe("두부조림", main("두부", "대파"));

  // 둘 다 재료를 전부 가지고 있어 매칭률은 같다. 갈리는 건 소진임박뿐.
  const ownedAll = owned("계란", "당근", "두부", "대파");
  const expiring = selectExpiringNames(
    fifo("두부", "대파", "계란", "당근"),
    { ...DEFAULT_MATCHING_CONFIG, expiringTopN: 2 },
  );

  const ranked = rankRecipes([계란말이, 두부조림], ownedAll, expiring);
  assert.deepEqual(
    ranked.map((item) => item.name),
    ["두부조림", "계란말이"],
    "오래 묵은 두부·대파를 쓰는 쪽이 먼저 와야 한다",
  );
  assert.equal(ranked[0].match.score, 1);
  assert.equal(ranked[1].match.score, 0.6);

  // 가중치를 소진임박 0으로 돌리면 그 우위가 사라진다 — 손잡이가 실제로
  // 점수에 연결되어 있는지 확인한다.
  const flattened = rankRecipes([계란말이, 두부조림], ownedAll, expiring, {
    ...DEFAULT_MATCHING_CONFIG,
    weights: { availability: 1, expiring: 0 },
  });
  assert.equal(flattened[0].match.score, flattened[1].match.score);
});

test("부분 매칭 레시피도 목록에서 잘리지 않는다 (FR-08-02)", () => {
  const ranked = rankRecipes(
    [
      recipe("전부보유", main("두부")),
      recipe("절반보유", main("두부", "연어")),
      recipe("하나도없음", main("연어", "레몬")),
    ],
    owned("두부"),
    NONE,
  );

  assert.equal(ranked.length, 3);
  assert.deepEqual(
    ranked.map((item) => item.name),
    ["전부보유", "절반보유", "하나도없음"],
  );
});

test("전부 0점이어도 순서가 요청마다 흔들리지 않는다", () => {
  const recipes = [
    recipe("나물무침", main("시금치")),
    recipe("가지볶음", main("가지")),
    recipe("다시마국", main("다시마")),
  ];

  const first = rankRecipes(recipes, NONE, NONE).map((item) => item.name);
  const second = rankRecipes([...recipes].reverse(), NONE, NONE).map(
    (item) => item.name,
  );

  assert.deepEqual(first, second);
});

// ---------------------------------------------------------------------------
// 밀키트 CTA (FR-10-01)
// ---------------------------------------------------------------------------

test("밀키트 CTA는 애매한 매칭률 구간에서만 켜진다", () => {
  const band = DEFAULT_MATCHING_CONFIG.mealKitCtaBand;
  const at = (matchRate) => showsMealKitCta({ matchRate });

  assert.equal(at(1), false, "다 있으면 그냥 해먹으면 된다");
  assert.equal(at(0), false, "하나도 없으면 밀키트로도 감당이 안 된다");
  assert.equal(at(band.min), true);
  assert.equal(at(band.max), true);
  assert.equal(at((band.min + band.max) / 2), true);
  assert.equal(at(band.min - 0.01), false);
  assert.equal(at(band.max + 0.01), false);
});

test("주재료가 없는 레시피에는 CTA를 붙이지 않는다", () => {
  const match = scoreRecipe(recipe("수집중", []), NONE, NONE);
  assert.equal(showsMealKitCta(match), false);
});
