// 실행: node --test lib/recipes/mood.test.mjs
//
// "오늘 뭐 땡겨요" 무드 필터 (FR-09-08). LLM 재태깅 없이 이미 있는 필드
// (칼로리·주재료 개수·재료명)에서 규칙으로 계산한다 — isWhitelistedSeasoning이
// 이미 이런 키워드 목록 방식으로 잘 동작하고 있어 같은 패턴을 따른다.

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

const { MOODS, parseMoods, resolveMoods } = await import(
  "@/lib/recipes/mood.ts"
);

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

function recipe(name, { ingredients = [], calories = null } = {}) {
  return { id: `recipe-${name}`, name, imageUrl: null, calories, ingredients };
}

// ---------------------------------------------------------------------------

test("고추장이 들어가면 매콤하게로 분류된다", () => {
  const 제육볶음 = recipe("제육볶음", {
    ingredients: [...main("돼지고기"), ...seasoning("고추장", "설탕")],
  });
  assert.ok(resolveMoods(제육볶음).includes("매콤하게"));
});

test("고추가 고명으로만 들어가면 매콤하게로 보지 않는다", () => {
  // 실사용 데이터에서 확인된 오탐: "고추"를 키워드로 넣으면 색만 내는 고명
  // 요리(두부 달걀전)나 초절임(양파홍초절임)까지 매콤하게로 잘못 걸렸다.
  const 두부달걀전 = recipe("두부달걀전", {
    ingredients: [...main("두부", "고추"), ...seasoning("간장", "식초")],
  });
  assert.ok(!resolveMoods(두부달걀전).includes("매콤하게"));
});

test("이름에 매운 키워드가 있어도 매콤하게로 분류된다", () => {
  const 불닭볶음면 = recipe("불닭볶음면", { ingredients: main("면") });
  assert.ok(resolveMoods(불닭볶음면).includes("매콤하게"));
});

test("매운 신호가 없고 튀김·크림 계열도 아니면 담백하게로 분류된다", () => {
  const 계란찜 = recipe("계란찜", { ingredients: main("계란") });
  assert.ok(resolveMoods(계란찜).includes("담백하게"));
  assert.ok(!resolveMoods(계란찜).includes("매콤하게"));
});

test("매콤한 레시피는 담백하게에 동시에 들어가지 않는다", () => {
  const 김치찌개 = recipe("김치찌개", {
    ingredients: [...main("돼지고기", "김치"), ...seasoning("고추장")],
  });
  assert.ok(!resolveMoods(김치찌개).includes("담백하게"));
});

test("크림·버터·치즈처럼 기름진 재료가 있으면 담백하게가 아니다", () => {
  const 크림파스타 = recipe("크림파스타", {
    ingredients: [...main("면"), ...seasoning("크림", "버터", "치즈")],
  });
  assert.ok(!resolveMoods(크림파스타).includes("담백하게"));
});

test("칼로리 350 이상이면 든든하게로 분류된다", () => {
  const 삼겹살구이 = recipe("삼겹살구이", {
    ingredients: main("삼겹살"),
    calories: 450,
  });
  assert.ok(resolveMoods(삼겹살구이).includes("든든하게"));
});

test("칼로리가 350 미만이면 든든하게가 아니다", () => {
  const 나물무침 = recipe("나물무침", {
    ingredients: main("시금치"),
    calories: 80,
  });
  assert.ok(!resolveMoods(나물무침).includes("든든하게"));
});

test("칼로리 정보가 없으면 든든하게로 보지 않는다", () => {
  const 수집중 = recipe("수집중", { ingredients: main("두부") });
  assert.ok(!resolveMoods(수집중).includes("든든하게"));
});

test("주재료가 3개 이하면 간단하게로 분류된다", () => {
  const 계란말이 = recipe("계란말이", { ingredients: main("계란", "당근") });
  assert.ok(resolveMoods(계란말이).includes("간단하게"));
});

test("주재료가 4개 이상이면 간단하게가 아니다", () => {
  const 잡채 = recipe("잡채", {
    ingredients: main("당면", "소고기", "당근", "시금치"),
  });
  assert.ok(!resolveMoods(잡채).includes("간단하게"));
});

test("조미료는 간단하게 판정의 재료 수에 안 들어간다 (조미료 화이트리스트와 같은 기준)", () => {
  const 두부조림 = recipe("두부조림", {
    ingredients: [...main("두부"), ...seasoning("간장", "설탕", "고춧가루", "참기름")],
  });
  assert.ok(resolveMoods(두부조림).includes("간단하게"));
});

test("한 레시피가 여러 무드에 동시에 걸릴 수 있다", () => {
  const 매운돼지불고기 = recipe("매운돼지불고기", {
    ingredients: [...main("돼지고기"), ...seasoning("고추장")],
    calories: 500,
  });
  const moods = resolveMoods(매운돼지불고기);
  assert.ok(moods.includes("매콤하게"));
  assert.ok(moods.includes("든든하게"));
  assert.ok(moods.includes("간단하게"));
});

test("URL로 들어온 무드를 걸러서 받는다", () => {
  assert.deepEqual(parseMoods("매콤하게,든든하게"), ["매콤하게", "든든하게"]);
});

test("모르는 값은 무시한다", () => {
  assert.deepEqual(parseMoods("매콤하게,없는무드"), ["매콤하게"]);
  assert.deepEqual(parseMoods(null), []);
});

test("무드 목록에 중복이 없다", () => {
  assert.equal(new Set(MOODS).size, MOODS.length);
});
