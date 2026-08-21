// 실행: node --test lib/inventory/storage.test.mjs
//
// 보관 방식 추정과 경과율 정렬. 순수 함수라 DB도 LLM도 필요 없다.

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

const { inferStorageType, elapsedRatio, STORAGE_BASELINE_DAYS } = await import(
  "@/lib/inventory/storage.ts"
);

// ---------------------------------------------------------------------------

test("상품명의 (냉동)·(냉장) 표기를 재료명 추정보다 우선한다", () => {
  // 계란말이는 재료명만 보면 알 수 없지만 상품명이 답을 들고 있다.
  assert.equal(
    inferStorageType("소니또 계란말이 (냉동), 500g, 1개", "계란말이"),
    "frozen",
  );
  assert.equal(
    inferStorageType("모위 프리미엄 생연어 횟감용 (냉장), 500g", "연어"),
    "refrigerated",
  );
});

test("표기가 없으면 재료명으로 추정한다", () => {
  assert.equal(inferStorageType("국내산 청상추, 150g", "상추"), "refrigerated");
  assert.equal(inferStorageType("깐양파 1.5kg", "양파"), "room_temp");
  assert.equal(inferStorageType("곰곰 왕교자 1.05kg", "만두"), "frozen");
});

test("모르는 재료는 억지로 분류하지 않고 unknown으로 남긴다", () => {
  // 틀린 분류보다 미상이 낫다 — 사용자가 화면에서 고칠 수 있다(FR-04-05).
  assert.equal(inferStorageType("듣도보도 못한 신상품", "머루즙"), "unknown");
});

test("unknown은 실온에 준해 다뤄 방치되지 않게 한다", () => {
  assert.equal(
    STORAGE_BASELINE_DAYS.unknown,
    STORAGE_BASELINE_DAYS.room_temp,
    "미상을 냉동처럼 취급하면 오래 방치돼도 눈에 띄지 않는다",
  );
});

test("같은 날 산 냉동식품은 신선채소보다 덜 급하다", () => {
  // 이 프로젝트에서 실제로 관찰된 오류: 5일 된 냉동 계란말이가
  // 5일 된 상추와 똑같이 "먼저 드세요"로 올라왔다.
  const fresh = elapsedRatio(5, "refrigerated");
  const frozen = elapsedRatio(5, "frozen");

  assert.ok(
    fresh > frozen,
    `냉장(${fresh})이 냉동(${frozen})보다 급해야 한다`,
  );
});

test("보관 방식이 달라도 한 축으로 비교된다", () => {
  // 30일 지난 실온 양파(비율 1.0)가 3일 지난 냉장 우유(비율 0.43)보다 급하다.
  assert.ok(elapsedRatio(30, "room_temp") > elapsedRatio(3, "refrigerated"));
  // 반대로 6일 지난 냉장(0.86)은 6일 지난 실온(0.2)보다 급하다.
  assert.ok(elapsedRatio(6, "refrigerated") > elapsedRatio(6, "room_temp"));
});
