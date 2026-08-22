// 실행: node --test lib/ingredients/aliases.test.mjs
//
// FR-07-05: 같은 재료의 다른 이름 묶기.
//
// 여기가 틀리면 두 방향으로 조용히 망가진다. 안 묶이면 재고에 쌀이 있는데
// 볶음밥이 "밥이 없어요"로 뜨고, **한쪽만 묶이면** 있다고 판정하고도 가상
// 재고를 못 깎아 한 톨의 쌀로 한 주 내내 밥 요리가 배치된다. 둘 다 화면에는
// 오류가 안 뜬다.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

const { canonicalIngredient, expandAliases } = await import(
  "@/lib/ingredients/aliases.ts"
);

test("밥은 쌀로 모인다", () => {
  assert.equal(canonicalIngredient("밥"), "쌀");
  assert.equal(canonicalIngredient("쌀밥"), "쌀");
  // 대표는 그대로.
  assert.equal(canonicalIngredient("쌀"), "쌀");
});

test("묶을 게 없는 이름은 그대로 둔다", () => {
  for (const name of ["두부", "소고기", "양파", "처음보는재료"]) {
    assert.equal(canonicalIngredient(name), name);
  }
});

test("앞뒤 공백을 흡수한다", () => {
  assert.equal(canonicalIngredient("  밥 "), "쌀");
});

test("DB 조회용으로 묶인 이름을 모두 펼친다", () => {
  // 재고에 쌀만 있는데 "쌀"로만 조회하면 밥을 쓰는 레시피가 후보에서
  // 아예 빠져, 정규화를 해도 만날 일이 없다.
  const expanded = expandAliases(["쌀"]);
  assert.ok(expanded.includes("쌀"));
  assert.ok(expanded.includes("밥"));

  // 반대 방향도 된다 — 재고에 밥(남은 밥)이 있어도 쌀 레시피가 후보에 든다.
  const fromRice = expandAliases(["밥"]);
  assert.ok(fromRice.includes("쌀"));
  assert.ok(fromRice.includes("밥"));
});

test("펼칠 때 관계없는 이름은 그대로 하나만", () => {
  assert.deepEqual(expandAliases(["두부"]), ["두부"]);
});

test("중복은 접힌다", () => {
  const expanded = expandAliases(["쌀", "밥", "쌀"]);
  assert.equal(new Set(expanded).size, expanded.length);
});

test("잘못 묶으면 안 되는 것들은 안 묶여 있다", () => {
  // 비슷해 보여도 다른 재료다. 잘못 묶으면 없는 재료를 있다고 하게 되는데,
  // 그건 장 보러 가서야 알게 되는 거짓말이다.
  assert.notEqual(canonicalIngredient("생크림"), canonicalIngredient("우유"));
  assert.notEqual(canonicalIngredient("식빵"), canonicalIngredient("빵"));
  assert.notEqual(canonicalIngredient("소면"), canonicalIngredient("국수"));
});
