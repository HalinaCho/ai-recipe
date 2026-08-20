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
  assert.deepEqual(parseInstructions(REAL_ROW), [
    "손질된 새우를 끓는 물에 데쳐 건진다.",
    "연두부, 달걀을 믹서에 넣고 간다.",
    "찜기에 넣고 10분 정도 찐다.",
  ]);
});

test("중간에 빈 슬롯이 있어도 순서가 유지된다", () => {
  const steps = parseInstructions({
    MANUAL01: "",
    MANUAL02: "2. 북어채를 찢어 헹군다.",
    MANUAL03: "",
    MANUAL04: "5. 그릇에 담아낸다.",
  });
  assert.deepEqual(steps, ["북어채를 찢어 헹군다.", "그릇에 담아낸다."]);
});

test("MAIN 이미지가 없으면 썸네일로 떨어진다", () => {
  const recipe = mapCookRcp01Row({ ...REAL_ROW, ATT_FILE_NO_MAIN: "" });
  assert.ok(recipe.imageUrl.endsWith("10_00028_1.png"));
});

test("식별자나 이름이 없는 행은 버린다", () => {
  assert.equal(mapCookRcp01Row({ RCP_NM: "이름만 있음" }), null);
  assert.equal(mapCookRcp01Row({ RCP_SEQ: "1" }), null);
});
