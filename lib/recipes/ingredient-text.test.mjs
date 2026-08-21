// 실행: node --test lib/recipes/ingredient-text.test.mjs
//
// FR-07-03: 재료 원문에서 계량과 그룹을 뽑는 규칙을 고정한다.
//
// 이 파서는 정규식으로 지저분한 원문을 다루므로, 조금만 손대도 조용히
// 나빠진다. 화면에는 계량이 안 뜨거나 재료명이 "연두부 75g"처럼 나올 뿐
// 아무 오류도 안 난다. 실제 원문에서 관찰된 형태를 그대로 테스트로 박아 둔다.

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

const { attachAmounts, parseIngredientFragment, parseIngredientText } =
  await import("@/lib/recipes/ingredient-text.ts");

// ---------------------------------------------------------------------------
// 조각 하나 파싱 — 원문에서 실제로 관찰된 네 가지 형태
// ---------------------------------------------------------------------------

test("이름 뒤 계량 + 괄호가 함께 오면 둘 다 계량으로 간다", () => {
  // 이걸 놓치면 재료명이 "연두부 75g"으로 화면에 뜬다.
  const parsed = parseIngredientFragment("연두부 75g(3/4모)");
  assert.equal(parsed.name, "연두부");
  assert.equal(parsed.amount, "75g 3/4모");
});

test("괄호 안에만 계량이 있는 형태", () => {
  const parsed = parseIngredientFragment("김치(50g)");
  assert.equal(parsed.name, "김치");
  assert.equal(parsed.amount, "50g");
});

test("이름 뒤에 계량만 붙은 형태", () => {
  const parsed = parseIngredientFragment("숙주 100g");
  assert.equal(parsed.name, "숙주");
  assert.equal(parsed.amount, "100g");
});

test("분수 기호와 단위 표기도 계량으로 잡는다", () => {
  assert.equal(parseIngredientFragment("물 300ml(1½컵)").amount, "300ml 1½컵");
  assert.equal(parseIngredientFragment("달걀 30g(1/2개)").name, "달걀");
  assert.equal(parseIngredientFragment("설탕 5g(1작은술)").amount, "5g 1작은술");
});

test("계량이 없으면 이름만 남고 amount는 null이다", () => {
  const parsed = parseIngredientFragment("소금");
  assert.equal(parsed.name, "소금");
  assert.equal(parsed.amount, null);
});

test("빈 조각은 버린다", () => {
  assert.equal(parseIngredientFragment("   "), null);
  assert.equal(parseIngredientFragment(",")

, null);
});

// ---------------------------------------------------------------------------
// 전체 텍스트 — 줄바꿈·그룹·괄호 안 쉼표
// ---------------------------------------------------------------------------

test("괄호 안의 쉼표에서 조각을 자르지 않는다", () => {
  // "다진 돼지고기(등심, 60g)"를 그냥 쉼표로 자르면 "다진 돼지고기(등심"과
  // "60g)"이라는 쓰레기 두 조각이 나온다. 실제 원문에 흔한 형태다.
  const items = parseIngredientText("다진 돼지고기(등심, 60g), 새우젓(5g)");
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "다진 돼지고기");
  assert.equal(items[1].name, "새우젓");
  assert.equal(items[1].amount, "5g");
});

test("줄 앞의 그룹 라벨이 그 줄 재료들에 붙는다", () => {
  const items = parseIngredientText(
    "재료 닭가슴살(60g), 두부(60g)\n육수 다시마(5g), 무(40g)",
  );
  assert.deepEqual(
    items.map((item) => [item.group, item.name]),
    [
      ["재료", "닭가슴살"],
      ["재료", "두부"],
      ["육수", "다시마"],
      ["육수", "무"],
    ],
  );
});

test("그룹은 다음 그룹 라벨이 나올 때까지 이어진다", () => {
  const items = parseIngredientText("고명\n시금치 10g(3줄기)\n대파 5g");
  assert.equal(items.length, 2);
  assert.ok(items.every((item) => item.group === "고명"));
});

test("첫 줄의 요리 이름은 재료로 세지 않는다", () => {
  // 안 걸러내면 "새우두부계란찜"이 재료 하나로 목록에 들어간다.
  const items = parseIngredientText(
    "새우두부계란찜\n연두부 75g(3/4모), 달걀 30g(1/2개)",
    "새우 두부 계란찜",
  );
  assert.deepEqual(
    items.map((item) => item.name),
    ["연두부", "달걀"],
  );
});

test("빈 입력은 빈 배열", () => {
  assert.deepEqual(parseIngredientText(null), []);
  assert.deepEqual(parseIngredientText(""), []);
  assert.deepEqual(parseIngredientText("   \n  "), []);
});

// ---------------------------------------------------------------------------
// 기존 정규화 이름에 붙이기 — 여기가 실제 성공 지표다
// ---------------------------------------------------------------------------

test("정규화된 이름에 원문 계량을 붙인다", () => {
  const parsed = parseIngredientText("돼지고기 150g, 김치 120g, 두부 60g");
  const map = attachAmounts(["돼지고기", "김치", "두부"], parsed);

  assert.equal(map.get("돼지고기").amount, "150g");
  assert.equal(map.get("김치").amount, "120g");
  assert.equal(map.get("두부").amount, "60g");
});

test("정규화 이름이 원문 표기의 일부일 때도 붙는다", () => {
  const parsed = parseIngredientText("다진 돼지고기 60g, 어린 시금치 20g");
  const map = attachAmounts(["돼지고기", "시금치"], parsed);

  assert.equal(map.get("돼지고기").amount, "60g");
  assert.equal(map.get("시금치").amount, "20g");
});

test("표기가 달라도 동의어로 붙는다", () => {
  // 수집 때 LLM이 쇠고기→소고기, 달걀→계란으로 통일해 버려서 원문과 글자가
  // 다르다. 정규화 자체는 재고 매칭의 축이라 손대면 안 되므로, 붙일 때만
  // 동의어를 본다.
  const parsed = parseIngredientText("쇠고기 50g, 달걀 30g, 후춧가루 1g");
  const map = attachAmounts(["소고기", "계란", "후추"], parsed);

  assert.equal(map.get("소고기").amount, "50g");
  assert.equal(map.get("계란").amount, "30g");
  assert.equal(map.get("후추").amount, "1g");
});

test("같은 원문 조각이 두 재료에 중복으로 붙지 않는다", () => {
  const parsed = parseIngredientText("돼지고기 150g");
  const map = attachAmounts(["돼지고기", "고기"], parsed);
  // 하나만 가져가고 나머지는 안 붙는다 — 같은 150g이 두 줄에 뜨면 잘못이다.
  assert.equal(map.size, 1);
});

test("원문에 없는 재료는 조용히 안 붙는다", () => {
  // LLM이 원문의 "육수"를 보고 "물"을 추론해 넣은 경우가 실제로 있다.
  // 못 붙이는 게 맞고, 화면은 계량 없이 이름만 보여준다.
  const parsed = parseIngredientText("돼지고기 150g");
  const map = attachAmounts(["돼지고기", "물"], parsed);

  assert.ok(map.has("돼지고기"));
  assert.equal(map.has("물"), false);
});

test("그룹도 함께 붙는다", () => {
  const parsed = parseIngredientText("재료 두부(60g)\n육수 다시마(5g)");
  const map = attachAmounts(["두부", "다시마"], parsed);

  assert.equal(map.get("두부").group, "재료");
  assert.equal(map.get("다시마").group, "육수");
});
