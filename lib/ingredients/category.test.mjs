// 실행: node --test lib/ingredients/category.test.mjs
//
// 이 테스트의 핵심은 마지막 "커버리지" 블록이다. 규칙 분류기는 조용히 부실해질
// 수 있다 — 규칙이 하나도 안 걸려도 "other"라는 그럴듯한 답이 나오기 때문이다.
// 그러면 FR-13-04의 다양성 항이 모든 레시피에 같은 값이 되어 죽는다.
// 그래서 실제 레시피 어휘를 통째로 넣고 "other" 비율에 상한을 건다.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// 번들러가 해주던 두 가지를 테스트 러너에서 대신한다: tsconfig의 "@/*" 별칭과
// 확장자 없는 상대 경로. 정적 import는 훅이 돌기 전에 해석되므로, 대상
// 모듈은 아래에서 동적으로 불러온다.
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

const { categoryShares, resolveCategory } = await import(
  "@/lib/ingredients/category.ts"
);
const { DEFAULT_MEAL_PLAN_CONFIG } = await import("@/lib/meal-plan/config.ts");

const vocabulary = JSON.parse(
  readFileSync(
    path.join(projectRoot, "lib/ingredients/recipe-vocabulary.json"),
    "utf8",
  ),
);

// ---------------------------------------------------------------------------
// 우선순위
// ---------------------------------------------------------------------------

test("조미료 화이트리스트가 가장 먼저 걸린다 (FR-07-02와 같은 목록)", () => {
  for (const name of ["간장", "고춧가루", "참기름", "다진마늘", "밀가루"]) {
    assert.equal(resolveCategory(name), "seasoning", name);
  }
});

test("표기 흔들림(공백)을 흡수한다", () => {
  assert.equal(resolveCategory("다진 마늘"), "seasoning");
  assert.equal(resolveCategory(" 소고기 "), "meat");
});

test("아이콘 시드의 명시적 매핑이 패턴보다 우선한다", () => {
  // 시드가 두부를 grain으로 못 박아 뒀다. 아이콘과 다양성 축이 갈리면 안 된다.
  assert.equal(resolveCategory("두부"), "grain");
  assert.equal(resolveCategory("김치"), "vegetable");
  assert.equal(resolveCategory("어묵"), "seafood");
});

test("아무 규칙에도 안 걸리면 other", () => {
  assert.equal(resolveCategory("젤라틴"), "other");
  assert.equal(resolveCategory("나무막대기"), "other");
  assert.equal(resolveCategory(""), "other");
});

// ---------------------------------------------------------------------------
// 패턴 규칙
// ---------------------------------------------------------------------------

test("육류 패턴", () => {
  for (const name of [
    "돼지고기",
    "닭가슴살",
    "등갈비",
    "삼겹살",
    "목살",
    "오리고기",
    "베이컨",
    "소시지",
    "족발",
    "살라미",
  ]) {
    assert.equal(resolveCategory(name), "meat", name);
  }
});

test("해산물 패턴 — 생선·조개·해조류", () => {
  for (const name of [
    "고등어",
    "갈치",
    "훈제연어",
    "바지락살",
    "홍합",
    "오징어",
    "낙지",
    "멸치",
    "미역줄기",
    "다시마",
    "물파래",
    "황태포",
    "명란젓",
    "가자미",
  ]) {
    assert.equal(resolveCategory(name), "seafood", name);
  }
});

test("유제품·알 패턴", () => {
  for (const name of ["우유", "생크림", "사워크림", "모짜렐라치즈", "메추리알", "계란말이"]) {
    assert.equal(resolveCategory(name), "dairy", name);
  }
});

test("채소·과일 패턴", () => {
  for (const name of [
    "애호박",
    "새송이버섯",
    "취나물",
    "깻잎",
    "적양배추",
    "방울토마토",
    "오이피클",
    "깻잎장아찌",
    "사과",
    "청포도",
    "블루베리",
  ]) {
    assert.equal(resolveCategory(name), "vegetable", name);
  }
});

test("곡류·콩·견과 패턴", () => {
  for (const name of [
    "현미밥",
    "찹쌀가루",
    "스파게티면",
    "가래떡",
    "식빵",
    "도토리묵",
    "병아리콩",
    "아몬드",
    "흑임자",
    "만두피",
  ]) {
    assert.equal(resolveCategory(name), "grain", name);
  }
});

// ---------------------------------------------------------------------------
// 오분류 함정 — 규칙 순서가 실제로 지켜지는지
// ---------------------------------------------------------------------------

test("'장어'는 해산물이고, '장'이 들어간 조미료에 끌려가지 않는다", () => {
  assert.equal(resolveCategory("장어"), "seafood");
  assert.equal(resolveCategory("간장"), "seasoning");
  assert.equal(resolveCategory("고추장"), "seasoning");
  // 반대 방향도 확인: 조미료 규칙이 해산물을 삼키지 않는다.
  assert.equal(resolveCategory("액젓"), "seasoning");
  assert.equal(resolveCategory("명란젓"), "seafood");
});

test("'치'로 끝나는 채소가 생선으로 넘어가지 않는다", () => {
  assert.equal(resolveCategory("시금치"), "vegetable");
  assert.equal(resolveCategory("배추김치"), "vegetable");
  assert.equal(resolveCategory("묵은지"), "vegetable");
  assert.equal(resolveCategory("참치"), "seafood");
});

test("'살'로 끝나는 해산물이 육류로 넘어가지 않는다", () => {
  for (const name of ["게살", "조갯살", "소라살", "홍합살", "게맛살"]) {
    assert.equal(resolveCategory(name), "seafood", name);
  }
});

test("콩으로 만든 것과 콩나물을 구분한다", () => {
  assert.equal(resolveCategory("콩나물"), "vegetable");
  assert.equal(resolveCategory("숙주나물"), "vegetable");
  assert.equal(resolveCategory("콩고기"), "grain", "이름에 '고기'가 있어도 콩이다");
  assert.equal(resolveCategory("두유"), "grain");
  assert.equal(resolveCategory("완두콩"), "grain");
});

test("'무'로 끝나는 해조류와 채소를 구분한다", () => {
  assert.equal(resolveCategory("우무"), "seafood");
  assert.equal(resolveCategory("순무"), "vegetable");
  assert.equal(resolveCategory("열무"), "vegetable");
});

// ---------------------------------------------------------------------------
// 카테고리 비중
// ---------------------------------------------------------------------------

test("카테고리 비중의 합은 1이고, 축에 없는 카테고리는 빠진다", () => {
  const shares = categoryShares(
    ["소고기", "돼지고기", "상추", "간장"],
    DEFAULT_MEAL_PLAN_CONFIG.diversityCategories,
  );

  // 간장은 seasoning이라 diversityCategories에 없다 → 분모에서 빠진다.
  assert.equal(shares.get("meat"), 2 / 3);
  assert.equal(shares.get("vegetable"), 1 / 3);
  assert.equal(shares.has("seasoning"), false);
  assert.equal(
    [...shares.values()].reduce((sum, value) => sum + value, 0),
    1,
  );
});

test("셀 재료가 없으면 빈 비중", () => {
  assert.equal(
    categoryShares([], DEFAULT_MEAL_PLAN_CONFIG.diversityCategories).size,
    0,
  );
  assert.equal(
    categoryShares(["간장", "소금"], DEFAULT_MEAL_PLAN_CONFIG.diversityCategories)
      .size,
    0,
    "조미료만 샀으면 다양성 축에는 아무것도 안 남는다",
  );
});

// ---------------------------------------------------------------------------
// 커버리지 — 이 테스트가 규칙이 부실해지는 것을 막는다
// ---------------------------------------------------------------------------

/** other 비율 상한. 넘으면 다양성 보너스가 상수에 가까워져 항이 죽는다. */
const MAX_OTHER_RATIO = 0.4;

test(`레시피 주재료 어휘의 "other" 비율이 ${MAX_OTHER_RATIO * 100}% 미만이어야 한다`, () => {
  const names = vocabulary.main;
  const byCategory = new Map();
  const unresolved = [];

  for (const name of names) {
    const category = resolveCategory(name);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
    if (category === "other") unresolved.push(name);
  }

  const otherRatio = unresolved.length / names.length;

  const breakdown = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) =>
      `${category} ${count} (${((count / names.length) * 100).toFixed(1)}%)`,
    )
    .join(", ");

  console.log(`  주재료 어휘 ${names.length}종 → ${breakdown}`);
  console.log(`  other(${unresolved.length}): ${unresolved.join(", ")}`);

  assert.ok(
    otherRatio < MAX_OTHER_RATIO,
    `other 비율 ${(otherRatio * 100).toFixed(1)}% — 규칙이 부실하다`,
  );
});

test("조미료를 포함한 전체 어휘도 대부분 분류된다", () => {
  const names = vocabulary.all;
  const unresolved = names.filter((name) => resolveCategory(name) === "other");
  const otherRatio = unresolved.length / names.length;

  console.log(
    `  전체 어휘 ${names.length}종 → other ${unresolved.length} (${(otherRatio * 100).toFixed(1)}%)`,
  );
  assert.ok(otherRatio < MAX_OTHER_RATIO);
});
