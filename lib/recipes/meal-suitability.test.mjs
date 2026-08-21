// 실행: node --test lib/recipes/meal-suitability.test.mjs
//
// FR-13-06 끼니·간식 구분.
//
// 여기서 제일 중요한 건 "후식을 막는다"가 아니라 **모르면 통과시킨다**는 쪽이다.
// category가 null인 행(백필 전이거나 다른 소스)을 간식으로 밀어내면 후보 풀이
// 비고, 그러면 식단표에 빈 칸이 생겨 FR-13-03을 어긴다. 꿀환이 한 번 뜨는 것보다
// 훨씬 나쁜 실패라, 그 방향을 테스트로 못 박는다.

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

const { categoryLabel, isMealSuitable, isSnackCategory } = await import(
  "@/lib/recipes/meal-suitability.ts"
);

test("후식은 끼니 후보가 아니다", () => {
  // "건강 마늘 꿀환"이 저녁 칸에 배치된 실제 사례가 이 분류에 걸린다.
  assert.equal(isMealSuitable("후식"), false);
  assert.equal(isSnackCategory("후식"), true);
});

test("식약처의 나머지 분류는 전부 끼니다", () => {
  for (const category of ["반찬", "일품", "밥", "국&찌개", "기타"]) {
    assert.equal(isMealSuitable(category), true, `${category}가 막혔다`);
  }
});

test("분류를 모르면 끼니로 본다 (빈 칸을 만드는 것보다 낫다)", () => {
  for (const value of [null, undefined, "", "   "]) {
    assert.equal(isMealSuitable(value), true);
    assert.equal(isSnackCategory(value), false);
  }
});

test("처음 보는 분류가 생겨도 막지 않는다", () => {
  // 소스가 분류를 늘렸을 때 새 값이 조용히 차단되면, 그 분류의 레시피가
  // 통째로 식단표에서 사라진 것을 알아챌 방법이 없다.
  assert.equal(isMealSuitable("샐러드"), true);
  assert.equal(isMealSuitable("면류"), true);
});

test("앞뒤 공백이 있어도 후식으로 잡는다", () => {
  assert.equal(isMealSuitable(" 후식 "), false);
});

test("분류 라벨은 원문 그대로 쓰고 빈 값만 null이다", () => {
  assert.equal(categoryLabel("후식"), "후식");
  assert.equal(categoryLabel("국&찌개"), "국&찌개");
  assert.equal(categoryLabel(null), null);
  assert.equal(categoryLabel("  "), null);
  // "기타"를 억지로 만들어 붙이지 않는다 — 원본의 "기타"와 구분이 안 된다.
  assert.notEqual(categoryLabel(null), "기타");
});
