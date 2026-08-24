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
  diversifyRanked,
  mainIngredientNames,
  rankRecipes,
  resolveWeights,
  scoreRecipe,
  selectExpiringNames,
  showsMealKitCta,
} = await import("@/lib/recipes/matching/score.ts");

/** 취향 신호가 없을 때 실제로 쓰이는 가중치(재배분 후) — 하드코딩 없이 구한다. */
const NO_SIGNAL_WEIGHTS = resolveWeights(DEFAULT_MATCHING_CONFIG, false);

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

/** 재료별 순 선호도 맵. affinity({ 돼지고기: 1, 양파: -1 }) 형태로 쓴다. */
function affinity(pairs) {
  return new Map(Object.entries(pairs));
}

const NO_AFFINITY = new Map();

// ---------------------------------------------------------------------------

test("주재료를 다 가지고 있으면 매칭률 1", () => {
  const match = scoreRecipe(
    recipe("계란말이", [...main("계란", "대파", "당근"), ...seasoning("소금")]),
    owned("계란", "대파", "당근"),
    NONE,
  );

  assert.equal(match.matchRate, 1);
  // 취향 신호가 없는 가구라 preference 몫이 availability로 재배분된다.
  assert.equal(match.score, NO_SIGNAL_WEIGHTS.availability);
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

  // 취향 신호가 없는 가구라 preference 몫이 availability로 재배분된다.
  assert.equal(withoutBonus.score, NO_SIGNAL_WEIGHTS.availability);
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
  assert.equal(ranked[1].match.score, NO_SIGNAL_WEIGHTS.availability);

  // 가중치를 소진임박 0으로 돌리면 그 우위가 사라진다 — 손잡이가 실제로
  // 점수에 연결되어 있는지 확인한다.
  const flattened = rankRecipes([계란말이, 두부조림], ownedAll, expiring, NO_AFFINITY, {
    ...DEFAULT_MATCHING_CONFIG,
    weights: { availability: 1, expiring: 0, preference: 0 },
  });
  assert.equal(flattened[0].match.score, flattened[1].match.score);
});

// ---------------------------------------------------------------------------
// 취향 반영 (추천 알고리즘 V2 Level 1)
// ---------------------------------------------------------------------------

test("취향 신호가 하나도 없으면 예전처럼 재고 중심으로만 채점한다", () => {
  const 계란말이 = recipe("계란말이", main("계란", "당근"));
  const withNoSignal = scoreRecipe(계란말이, owned("계란", "당근"), NONE);

  // ingredientAffinity를 아예 안 넘긴 것과 빈 Map을 넘긴 것이 같아야 한다 —
  // "신호 없음"의 두 가지 표현이 갈리면 안 된다.
  const withEmptyMap = scoreRecipe(
    계란말이,
    owned("계란", "당근"),
    NONE,
    NO_AFFINITY,
  );

  assert.equal(withNoSignal.score, withEmptyMap.score);
  assert.equal(withNoSignal.score, NO_SIGNAL_WEIGHTS.availability);
});

test("좋아하는 재료를 쓰면 점수가 올라간다", () => {
  const 제육볶음 = recipe("제육볶음", main("돼지고기", "양파"));
  const ownedBoth = owned("돼지고기", "양파");

  const withoutPreference = scoreRecipe(제육볶음, ownedBoth, NONE);
  const withPreference = scoreRecipe(
    제육볶음,
    ownedBoth,
    NONE,
    affinity({ 돼지고기: 1, 양파: 1 }), // 취향 퀴즈 좋아요 + 북마크 + 요리 이력에서 모인 순 선호도
  );

  assert.ok(
    withPreference.score > withoutPreference.score,
    "선호 재료를 쓰는 레시피가 더 높은 점수를 받아야 한다",
  );
  assert.equal(
    withPreference.score,
    DEFAULT_MATCHING_CONFIG.weights.availability +
      DEFAULT_MATCHING_CONFIG.weights.preference,
    "매칭률·선호율 둘 다 1이면 availability+preference 몫을 그대로 받는다",
  );
});

test("싫어하는 재료를 쓰면 점수가 내려간다", () => {
  const 가지볶음 = recipe("가지볶음", main("가지"));
  const ownedGaji = owned("가지");

  const withoutDislike = scoreRecipe(가지볶음, ownedGaji, NONE);
  const withDislike = scoreRecipe(
    가지볶음,
    ownedGaji,
    NONE,
    affinity({ 가지: -1 }), // 취향 퀴즈에서 싫어요로 매긴 레시피의 재료
  );

  assert.ok(
    withDislike.score < withoutDislike.score,
    "싫어하는 재료를 쓰는 레시피는 재고를 다 갖고 있어도 밀려야 한다",
  );
});

test("싫어요가 몰려도 점수는 0 밑으로 내려가지 않는다", () => {
  const 생선구이 = recipe("생선구이", main("생선"));

  // 재고에도 없고(matchRate 0) 취향도 싫어요뿐이라 이론상 음수가 나올 수 있다.
  const match = scoreRecipe(생선구이, NONE, NONE, affinity({ 생선: -1 }));

  assert.equal(match.score, 0);
});

test("취향은 레시피가 아니라 재료 단위로 일반화된다", () => {
  // 감자조림을 좋아하면(취향 신호에 "감자"가 들어있으면), 감자를 쓰는 다른
  // 레시피(카레라이스)도 가산점을 받아야 한다 — 좋아요를 레시피 id로만
  // 저장하면 이 효과가 안 생긴다.
  const 카레라이스 = recipe("카레라이스", main("닭고기", "감자"));
  const 계란말이 = recipe("계란말이", main("계란", "당근"));
  const likedIngredients = affinity({ 감자: 1 }); // 감자조림을 좋아해서 모인 재료
  const ownedAll = owned("닭고기", "감자", "계란", "당근");

  const curryScore = scoreRecipe(카레라이스, ownedAll, NONE, likedIngredients);
  const eggScore = scoreRecipe(계란말이, ownedAll, NONE, likedIngredients);

  // 둘 다 재료를 전부 가지고 있어 matchRate는 같다(1). 갈리는 건 선호뿐.
  assert.equal(curryScore.matchRate, 1);
  assert.equal(eggScore.matchRate, 1);
  assert.ok(
    curryScore.score > eggScore.score,
    "선호 재료(감자)를 쓰는 레시피가 더 높아야 한다",
  );
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

// ---------------------------------------------------------------------------
// 다양성 — 같은 재료 반복 억제 (FR-09-09)
// ---------------------------------------------------------------------------

/** rankRecipes를 거치지 않고 diversifyRanked 입력을 직접 만든다. */
function listItem(name, score, ownedMainIngredients) {
  return {
    id: `id-${name}`,
    name,
    imageUrl: null,
    calories: null,
    category: null,
    match: {
      score,
      matchRate: 1,
      ownedMainIngredients,
      missingMainIngredients: [],
      usesExpiringIngredients: [],
    },
    showMealKitCta: false,
  };
}

const DIVERSITY_CONFIG = { repeatThreshold: 2, repeatPenalty: 0.5 };

test("같은 재료 레시피가 도배하면 다른 재료 레시피가 사이에 끼어든다", () => {
  const ranked = [
    listItem("두부A", 0.9, ["두부"]),
    listItem("두부B", 0.85, ["두부"]),
    listItem("두부C", 0.8, ["두부"]),
    listItem("두부D", 0.75, ["두부"]),
    listItem("감자E", 0.6, ["감자"]),
    listItem("두부F", 0.7, ["두부"]),
  ];

  const diversified = diversifyRanked(ranked, ranked.length, DIVERSITY_CONFIG);

  const top3 = diversified.slice(0, 3);
  const tofuInTop3 = top3.filter((item) =>
    item.match.ownedMainIngredients.includes("두부"),
  ).length;

  assert.ok(
    tofuInTop3 <= DIVERSITY_CONFIG.repeatThreshold,
    "상위 3자리에 두부 레시피가 repeatThreshold개를 넘으면 안 된다",
  );
  assert.ok(
    top3.some((item) => item.name === "감자E"),
    "다른 재료 레시피가 상위권에 끼어들어야 한다",
  );
});

test("재료가 겹치지 않으면 순서가 그대로 유지된다", () => {
  const ranked = [
    listItem("A", 0.9, ["계란"]),
    listItem("B", 0.8, ["감자"]),
    listItem("C", 0.7, ["당근"]),
  ];

  const diversified = diversifyRanked(ranked, ranked.length, DIVERSITY_CONFIG);

  assert.deepEqual(
    diversified.map((item) => item.name),
    ["A", "B", "C"],
  );
});

test("윈도우 밖의 항목은 건드리지 않는다", () => {
  const ranked = [
    listItem("두부A", 0.9, ["두부"]),
    listItem("두부B", 0.85, ["두부"]),
    listItem("두부C", 0.8, ["두부"]),
    listItem("감자D", 0.5, ["감자"]),
  ];

  // 윈도우가 2면 뒤쪽 두 항목(두부C, 감자D)은 원래 순서 그대로 맨 뒤에 붙는다.
  const diversified = diversifyRanked(ranked, 2, DIVERSITY_CONFIG);

  assert.deepEqual(
    diversified.map((item) => item.name),
    ["두부A", "두부B", "두부C", "감자D"],
  );
});
