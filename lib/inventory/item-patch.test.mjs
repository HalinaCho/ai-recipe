// 실행: node --test lib/inventory/item-patch.test.mjs
//
// FR-04-08 항목 수정의 입력 검증을 고정한다.
//
// 여기가 신뢰 경계다. 특히 **빈 이름**을 막는 게 중요한데, 이름이 비면
// 매칭에서 영영 빠지면서 화면에는 빈 줄로만 남아 왜 추천에 안 잡히는지
// 알아낼 방법이 없다. 오류가 안 나는 종류의 고장이다.

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
  return (
    [`${base}.ts`, path.join(base, "index.ts")].find((c) => existsSync(c)) ?? null
  );
}

registerHooks({
  resolve(specifier, context, next) {
    const resolved = resolveSource(specifier, context.parentURL);
    return resolved ? next(pathToFileURL(resolved).href, context) : next(specifier, context);
  },
});

const { buildInventoryPatch: buildPatch } = await import(
  "@/lib/inventory/item-patch.ts",
);

test("소진 요청은 패치가 아니다 (null)", () => {
  // null을 줘야 라우트가 소진 처리 쪽으로 흘러간다.
  assert.equal(buildPatch({ consumedVia: "manual" }), null);
  assert.equal(buildPatch(null), null);
  assert.equal(buildPatch({}), null);
});

test("보낸 필드만 패치에 담긴다", () => {
  assert.deepEqual(buildPatch({ quantity: "2봉" }), { quantity: "2봉" });
  assert.deepEqual(buildPatch({ normalizedName: "두부" }), {
    normalizedName: "두부",
  });
});

test("이름 앞뒤 공백은 지운다", () => {
  assert.equal(buildPatch({ normalizedName: "  두부  " }).normalizedName, "두부");
});

test("이름을 빈 값으로 지울 수 없다", () => {
  for (const value of ["", "   "]) {
    const result = buildPatch({ normalizedName: value });
    assert.ok(result instanceof Error, `"${value}"가 통과했다`);
    assert.match(result.message, /비울 수 없/);
  }
});

test("터무니없이 긴 값은 막는다", () => {
  assert.ok(buildPatch({ normalizedName: "가".repeat(61) }) instanceof Error);
  assert.ok(buildPatch({ quantity: "가".repeat(61) }) instanceof Error);
});

test("수량을 비우면 '1개'로 되돌린다", () => {
  // 빈 수량은 목록에서 가운뎃점 하나만 남아 어색하다.
  assert.equal(buildPatch({ quantity: "  " }).quantity, "1개");
});

test("구매일은 YYYY-MM-DD만 받는다", () => {
  assert.equal(buildPatch({ purchasedAt: "2026-08-21" }).purchasedAt, "2026-08-21");
  for (const bad of ["2026/08/21", "26-8-1", "어제", "2026-13-45", ""]) {
    assert.ok(buildPatch({ purchasedAt: bad }) instanceof Error, `"${bad}"가 통과했다`);
  }
});

test("보관 방식은 정해진 값만 받는다", () => {
  assert.equal(buildPatch({ storageType: "frozen" }).storageType, "frozen");
  assert.ok(buildPatch({ storageType: "냉동" }) instanceof Error);
});

test("여러 필드를 한 번에 고칠 수 있다", () => {
  assert.deepEqual(
    buildPatch({ normalizedName: "두부", quantity: "1모", purchasedAt: "2026-08-20" }),
    { normalizedName: "두부", quantity: "1모", purchasedAt: "2026-08-20" },
  );
});
