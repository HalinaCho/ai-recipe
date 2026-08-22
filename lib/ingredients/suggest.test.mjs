// 실행: node --test lib/ingredients/suggest.test.mjs
//
// FR-04-07 자동완성 제안 순서.
//
// 이 규칙이 한 번 사용자를 헷갈리게 했다. "쌀"을 치면 쌀가루·좁쌀·찹쌀만
// 뜨고 정작 "쌀"이 없어서 "목록에 쌀이 없다"고 읽혔다. 오류도 안 나고
// 목록도 비어 있지 않아서, 값으로 보지 않으면 잡을 수 없는 종류다.

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

const { suggestIngredients } = await import("@/lib/ingredients/suggest.ts");

/** 실제 어휘를 쓴다 — 손으로 만든 목록은 진짜 데이터의 함정을 못 잡는다. */
const VOCAB = JSON.parse(
  readFileSync(
    path.join(projectRoot, "lib/ingredients/recipe-vocabulary.json"),
    "utf8",
  ),
).main;

test("정확히 일치하는 재료가 맨 앞에 온다", () => {
  // 이게 빠져서 "쌀은 목록에 없다"는 오해가 났다.
  assert.equal(suggestIngredients("쌀", VOCAB)[0], "쌀");
  assert.equal(suggestIngredients("두부", VOCAB)[0], "두부");
  assert.equal(suggestIngredients("감자", VOCAB)[0], "감자");
});

test("쌀을 쳤을 때 변형만 나오지 않는다", () => {
  const suggestions = suggestIngredients("쌀", VOCAB);
  assert.ok(
    suggestions.includes("쌀"),
    `"쌀"이 빠졌다: ${suggestions.join(", ")}`,
  );
  // 변형도 같이 보여야 유용하다 (쌀가루를 찾던 사람도 있다).
  assert.ok(suggestions.includes("쌀가루"));
});

test("정확 일치가 없으면 앞에서부터 일치하는 것이 먼저", () => {
  // "파"를 치면 "파프리카"가 "대파"보다 위에 오는 게 자연스럽다.
  const suggestions = suggestIngredients("파", VOCAB);
  const firstContains = suggestions.findIndex((s) => !s.startsWith("파"));
  const lastStarts = suggestions.findLastIndex((s) => s.startsWith("파"));
  assert.ok(
    firstContains === -1 || lastStarts < firstContains,
    `순서가 섞였다: ${suggestions.join(", ")}`,
  );
});

test("앞뒤 공백은 무시한다", () => {
  assert.deepEqual(suggestIngredients("  쌀  ", VOCAB), suggestIngredients("쌀", VOCAB));
});

test("빈 입력은 아무것도 제안하지 않는다", () => {
  assert.deepEqual(suggestIngredients("", VOCAB), []);
  assert.deepEqual(suggestIngredients("   ", VOCAB), []);
});

test("어휘에 없는 이름은 빈 목록", () => {
  assert.deepEqual(suggestIngredients("존재하지않는재료", VOCAB), []);
});

test("제안 수 상한을 지킨다", () => {
  // 상한이 없으면 "고"처럼 흔한 글자에 수십 개가 쏟아진다.
  assert.ok(suggestIngredients("고", VOCAB).length <= 8);
  assert.equal(suggestIngredients("고", VOCAB, 3).length, 3);
});

test("같은 재료가 두 번 나오지 않는다", () => {
  for (const query of ["쌀", "두부", "파", "고기"]) {
    const suggestions = suggestIngredients(query, VOCAB);
    assert.equal(
      new Set(suggestions).size,
      suggestions.length,
      `"${query}"에 중복이 있다`,
    );
  }
});
