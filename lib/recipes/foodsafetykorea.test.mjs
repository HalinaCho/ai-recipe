// 실행: node --test lib/recipes/foodsafetykorea.test.mjs
//
// 실제 COOKRCP01 응답에서 그대로 떠 온 행으로 매핑만 확인한다. 네트워크 없음.

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

const { mapCookRcp01Row, parseInstructions } = await import(
  "@/lib/recipes/foodsafetykorea.ts"
);

/** RCP_SEQ 28번 행 (실제 응답에서 필요한 필드만). */
const REAL_ROW = {
  RCP_SEQ: "28",
  RCP_NM: "새우 두부 계란찜",
  RCP_PARTS_DTLS:
    "새우두부계란찜\n연두부 75g(3/4모), 칵테일새우 20g(5마리), 달걀 30g(1/2개)",
  ATT_FILE_NO_MK: "http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00028_1.png",
  ATT_FILE_NO_MAIN: "http://www.foodsafetykorea.go.kr/uploadimg/cook/10_00028_2.png",
  INFO_ENG: "220",
  INFO_CAR: "3",
  INFO_PRO: "14",
  INFO_FAT: "17",
  INFO_NA: "99",
  MANUAL01: "1. 손질된 새우를 끓는 물에 데쳐 건진다.a",
  MANUAL02: "2. 연두부, 달걀을 믹서에 넣고 간다.b",
  MANUAL03: "3. 찜기에 넣고 10분 정도 찐다.c",
  MANUAL04: "",
  MANUAL20: "",
};

test("실제 행을 RawSourceRecipe로 옮긴다", () => {
  const recipe = mapCookRcp01Row(REAL_ROW);

  assert.equal(recipe.sourceRecipeId, "28");
  assert.equal(recipe.name, "새우 두부 계란찜");
  // 완성 사진(MAIN)을 쓰고, 혼합 콘텐츠가 되지 않게 https로 올린다.
  assert.equal(
    recipe.imageUrl,
    "https://www.foodsafetykorea.go.kr/uploadimg/cook/10_00028_2.png",
  );
  assert.deepEqual(recipe.nutrition, {
    calories: 220,
    carbohydrate: 3,
    protein: 14,
    fat: 17,
    sodium: 99,
  });
  assert.ok(recipe.ingredientsText.includes("연두부 75g"));
});

test("조리 순서에서 번호와 이미지 대응 문자를 걷어낸다", () => {
  assert.deepEqual(
    parseInstructions(REAL_ROW).map((step) => step.text),
    [
      "손질된 새우를 끓는 물에 데쳐 건진다.",
      "연두부, 달걀을 믹서에 넣고 간다.",
      "찜기에 넣고 10분 정도 찐다.",
    ],
  );
});

test("단계마다 그 단계의 사진이 함께 붙는다 (FR-06-03)", () => {
  // 실데이터는 조리단계 6,717개가 100% 사진을 갖고 있다. 글과 사진을
  // 한 객체로 묶어 두는 것이 이 테스트가 지키는 계약이다 — 두 배열을
  // 인덱스로 맞추는 구조였다면 3단계 사진이 2단계에 붙어도 아무 오류가
  // 안 났을 것이다.
  const steps = parseInstructions({
    MANUAL01: "1. 새우를 데친다.",
    MANUAL_IMG01: "http://www.foodsafetykorea.go.kr/uploadimg/cook/20_1_1.png",
    MANUAL02: "2. 믹서에 간다.",
    MANUAL_IMG02: "http://www.foodsafetykorea.go.kr/uploadimg/cook/20_1_2.png",
  });

  assert.equal(steps.length, 2);
  // http로 오는 원본을 https로 올려야 한다 — 안 그러면 브라우저가 혼합
  // 콘텐츠로 막아 이미지가 **조용히** 안 뜬다.
  assert.equal(
    steps[0].imageUrl,
    "https://www.foodsafetykorea.go.kr/uploadimg/cook/20_1_1.png",
  );
  assert.ok(steps[1].imageUrl.endsWith("20_1_2.png"));
});

test("사진 없는 단계는 imageUrl이 null이고 글은 살아 있다", () => {
  const steps = parseInstructions({ MANUAL01: "1. 새우를 데친다." });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].imageUrl, null);
  assert.equal(steps[0].text, "새우를 데친다.");
});

test("글 없이 사진만 있는 칸은 단계로 세지 않는다", () => {
  // 세면 번호가 밀려서 "3단계"가 실제로는 2번째 지시가 된다.
  const steps = parseInstructions({
    MANUAL01: "1. 새우를 데친다.",
    MANUAL_IMG02: "http://example.com/orphan.png",
    MANUAL03: "3. 찜기에 넣는다.",
  });
  assert.deepEqual(
    steps.map((step) => step.text),
    ["새우를 데친다.", "찜기에 넣는다."],
  );
});

test("중간에 빈 슬롯이 있어도 순서가 유지된다", () => {
  const steps = parseInstructions({
    MANUAL01: "",
    MANUAL02: "2. 북어채를 찢어 헹군다.",
    MANUAL03: "",
    MANUAL04: "5. 그릇에 담아낸다.",
  });
  assert.deepEqual(
    steps.map((step) => step.text),
    ["북어채를 찢어 헹군다.", "그릇에 담아낸다."],
  );
});

test("MAIN 이미지가 없으면 썸네일로 떨어진다", () => {
  const recipe = mapCookRcp01Row({ ...REAL_ROW, ATT_FILE_NO_MAIN: "" });
  assert.ok(recipe.imageUrl.endsWith("10_00028_1.png"));
});

test("식별자나 이름이 없는 행은 버린다", () => {
  assert.equal(mapCookRcp01Row({ RCP_NM: "이름만 있음" }), null);
  assert.equal(mapCookRcp01Row({ RCP_SEQ: "1" }), null);
});
