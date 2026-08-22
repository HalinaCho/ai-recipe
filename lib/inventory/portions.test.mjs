// 실행: node --test lib/inventory/portions.test.mjs
//
// FR-04-09: 재고 한 행이 몇 끼분인지.
//
// 여기가 틀리면 식단표가 통째로 이상해진다. 넉넉히 잡으면 있지도 않은 재료로
// 한 주를 채우고(장 보러 가서야 안다), 짜게 잡으면 재고가 다섯 요리 만에
// 바닥나 뒤쪽 끼니가 전부 0%가 된다. 실제로 후자가 일어나서 만든 기능이다.

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

const { needsPortionCount, parsePortionCount, portionsOf } = await import(
  "@/lib/inventory/portions.ts"
);

// ---------------------------------------------------------------------------
// 무엇을 물어볼 것인가
// ---------------------------------------------------------------------------

test("개수를 알 수 없는 포장 단위는 물어본다", () => {
  // 양파 1망이 3개일 수도 8개일 수도 있다. 우리가 추측할 수 없는 값이다.
  for (const quantity of ["1망", "1봉", "1봉지", "1팩", "1단", "한 망 정도"]) {
    assert.equal(needsPortionCount(quantity, null), true, `"${quantity}"`);
  }
});

test("숫자가 분명한 표기는 묻지 않는다", () => {
  // 다 물어보면 알림이 시끄러워져 정작 중요한 것을 무시하게 된다.
  for (const quantity of ["500g", "3개", "1L", "300ml", "2모", "10구"]) {
    assert.equal(needsPortionCount(quantity, null), false, `"${quantity}"`);
  }
});

test("애매한 단위여도 개수가 2 이상이면 묻지 않는다", () => {
  // "3봉"은 3봉이라는 뜻이 분명하다.
  assert.equal(needsPortionCount("3봉", null), false);
  assert.equal(needsPortionCount("2팩", null), false);
  // 1은 "한 덩어리"라는 뜻이라 여전히 모른다.
  assert.equal(needsPortionCount("1팩", null), true);
});

test("이미 답한 항목은 다시 묻지 않는다", () => {
  assert.equal(needsPortionCount("1망", 6), false);
  assert.equal(needsPortionCount("1망", 1), false);
});

test("빈 수량은 묻지 않는다", () => {
  assert.equal(needsPortionCount("", null), false);
  assert.equal(needsPortionCount("   ", null), false);
});

// ---------------------------------------------------------------------------
// 몇 끼분으로 볼 것인가
// ---------------------------------------------------------------------------

test("개수를 모르면 한 끼분이다", () => {
  // 모르는 값을 넉넉히 잡으면 있지도 않은 재료로 식단표를 채우게 되고,
  // 그건 장 보러 가서야 알게 되는 거짓말이다.
  assert.equal(portionsOf({ quantity: "1개", portionCount: null, remainingFraction: 1 }), 1);
});

test("입력한 개수를 그대로 쓴다", () => {
  assert.equal(portionsOf({ quantity: "1개", portionCount: 6, remainingFraction: 1 }), 6);
});

test("남은 비율을 곱한다 (FR-05-03과 연결)", () => {
  // 사용자가 이미 관리하는 값이라 공짜로 정확도가 오른다.
  assert.equal(portionsOf({ quantity: "1개", portionCount: 6, remainingFraction: 0.5 }), 3);
  assert.equal(portionsOf({ quantity: "1개", portionCount: 8, remainingFraction: 0.25 }), 2);
});

test("조금이라도 남았으면 최소 한 끼분은 된다", () => {
  // ¼ 남은 양파 한 망(6개분)은 1.5끼분인데, 내림하면 1도 안 되어 "있는데
  // 없다"가 된다. 남아 있는 것은 최소 한 끼는 쓸 수 있다.
  assert.equal(portionsOf({ quantity: "1개", portionCount: 2, remainingFraction: 0.25 }), 1);
  assert.equal(portionsOf({ quantity: "1개", portionCount: 1, remainingFraction: 0.25 }), 1);
});

test("다 쓴 것은 0끼분이다", () => {
  assert.equal(portionsOf({ quantity: "1개", portionCount: 6, remainingFraction: 0 }), 0);
});

test("범위를 벗어난 남은 비율도 안전하게 다룬다", () => {
  assert.equal(portionsOf({ quantity: "1개", portionCount: 4, remainingFraction: 2 }), 4);
  assert.equal(portionsOf({ quantity: "1개", portionCount: 4, remainingFraction: -1 }), 0);
});

// ---------------------------------------------------------------------------
// 표기에서 개수 읽기 — 물어보기 전에 읽을 수 있는 건 읽는다
// ---------------------------------------------------------------------------

test("셀 수 있는 표기에서 개수를 읽는다", () => {
  // 실제 재고에 "6개"라고 적혀 있는데 1끼분으로 취급하고 있었다.
  assert.equal(parsePortionCount("6개"), 6);
  assert.equal(parsePortionCount("5마리"), 5);
  assert.equal(parsePortionCount("10구"), 10);
  assert.equal(parsePortionCount("2모"), 2);
});

test("무게·부피만 있으면 개수를 못 읽는다", () => {
  // 500g이 몇 끼분인지는 재료마다 달라 환산하지 않는다 (FR-05-04).
  assert.equal(parsePortionCount("500g"), null);
  assert.equal(parsePortionCount("1L"), null);
  assert.equal(parsePortionCount("300ml"), null);
});

test("무게와 개수가 섞이면 개수 쪽을 쓴다", () => {
  // "330g, 5개"는 5덩이라는 뜻이다.
  assert.equal(parsePortionCount("330g, 5개"), 5);
});

test("표기에서 2 이상을 읽었으면 묻지 않는다", () => {
  assert.equal(needsPortionCount("6개", null), false);
  assert.equal(needsPortionCount("3봉", null), false);
  // 1단은 몇 대인지 모른다 — 이건 물어봐야 한다.
  assert.equal(needsPortionCount("1단", null), true);
});

test("읽어낸 개수가 끼니분으로 쓰인다", () => {
  assert.equal(portionsOf({ quantity: "6개", portionCount: null, remainingFraction: 1 }), 6);
  // 반 남았으면 절반.
  assert.equal(portionsOf({ quantity: "6개", portionCount: null, remainingFraction: 0.5 }), 3);
  // 사용자가 직접 넣은 값이 표기보다 우선한다.
  assert.equal(portionsOf({ quantity: "6개", portionCount: 2, remainingFraction: 1 }), 2);
});

test("한글이 이어지면 단위로 보지 않는다", () => {
  // "3개월"의 "개"를 개수로 읽으면 안 된다.
  assert.equal(parsePortionCount("3개월"), null);
});
