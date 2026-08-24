// 실행: node --test lib/hooks/recipe-freshness.test.mjs
//
// 재고가 바뀌면(추가·수정·소진) 레시피 탭에 "방금 반영됐어요" 배지가 뜨게
// 하는 아주 작은 외부 스토어. react-query가 이미 알아서 재계산해 주지만,
// 그게 화면 뒤에서 조용히 일어나 사용자가 확인할 방법이 없었다 — 이 스토어는
// "언제 바뀌었는지"만 기억해서 화면이 자기 데이터 갱신 시각과 비교하게 한다.

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

const {
  getInventoryChangedAt,
  markInventoryChanged,
  subscribeInventoryChanged,
} = await import("./recipe-freshness.ts");

test("처음에는 바뀐 적이 없다", () => {
  assert.equal(getInventoryChangedAt(), null);
});

test("재고가 바뀌면 시각이 기록된다", () => {
  const before = Date.now();
  markInventoryChanged();
  const changedAt = getInventoryChangedAt();

  assert.ok(changedAt !== null);
  assert.ok(changedAt >= before);
});

test("다시 바뀌면 시각이 갱신된다", () => {
  markInventoryChanged();
  const first = getInventoryChangedAt();

  markInventoryChanged();
  const second = getInventoryChangedAt();

  assert.ok(second >= first);
});

test("구독자는 바뀔 때마다 알림을 받는다", () => {
  let calls = 0;
  const unsubscribe = subscribeInventoryChanged(() => {
    calls += 1;
  });

  markInventoryChanged();
  markInventoryChanged();

  assert.equal(calls, 2);
  unsubscribe();
  markInventoryChanged();
  assert.equal(calls, 2, "구독 해지 후에는 더 이상 불리지 않는다");
});
