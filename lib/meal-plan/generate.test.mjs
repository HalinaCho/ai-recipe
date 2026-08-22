// 실행: node --test lib/meal-plan/generate.test.mjs
//
// FR-13-01~03의 순차 배치를 값으로 고정한다.
//
// 이 파일이 특히 중요한 이유: 식단표는 "그럴듯하지만 틀린" 결과를 내기 쉽다.
// 연쇄 계산이 아예 안 돌아도 화면에는 요일별로 다른 레시피가 채워져 있어서
// 사람 눈으로는 정상과 구분되지 않는다. 재료가 실제로 덜어졌는지, 중복이
// 막혔는지, 빈 칸이 안 생겼는지는 테스트만이 붙들 수 있다.

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

const { placeWeek, replayWeek, slotKey } = await import(
  "@/lib/meal-plan/generate.ts"
);
const { buildWeekSlots } = await import("@/lib/meal-plan/slots.ts");
const { DEFAULT_MEAL_PLAN_CONFIG } = await import("@/lib/meal-plan/config.ts");
const { CONVENIENCE_CATALOG } = await import("@/lib/meal-plan/convenience.ts");

/**
 * 배치 규칙 자체를 보는 테스트는 간편식을 끈다. 간편식은 재료를 안 쓰고
 * 자리만 차지해서, 켜 두면 "몇 번째 요리"를 세는 검증이 전부 흔들린다.
 * 간편식 자체는 아래에서 따로 본다.
 */
const NO_CONVENIENCE = {
  ...DEFAULT_MEAL_PLAN_CONFIG,
  convenienceMealsPerWeek: 0,
};

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

function recipe(id, name, mains, category = "반찬") {
  return {
    id,
    name,
    imageUrl: null,
    calories: null,
    category,
    ingredients: mains.map((normalizedName) => ({
      normalizedName,
      role: "main",
      isWhitelistedSeasoning: false,
    })),
  };
}

function stock(...names) {
  return names.map((normalizedName) => ({ normalizedName }));
}

const NO_HISTORY = new Map();

/** 2026-08-24는 월요일. 공휴일이 없으면 평일 5칸 + 주말 4칸 = 9칸. */
const MONDAY = "2026-08-24";

// ---------------------------------------------------------------------------
// FR-11-01 — 칸 구성
// ---------------------------------------------------------------------------

test("평일은 저녁만, 주말은 점심+저녁 (FR-11-01)", () => {
  const slots = buildWeekSlots(MONDAY);

  assert.equal(slots.length, 9); // 평일 5 + 토 2 + 일 2
  assert.deepEqual(
    slots.filter((slot) => slot.date === "2026-08-24").map((s) => s.mealType),
    ["dinner"],
  );
  assert.deepEqual(
    slots.filter((slot) => slot.date === "2026-08-29").map((s) => s.mealType),
    ["lunch", "dinner"],
  );
});

test("평일 공휴일도 점심이 늘고 이름이 붙는다 (FR-11-02)", () => {
  const slots = buildWeekSlots(MONDAY, new Map([["2026-08-26", "테스트공휴일"]]));

  const wednesday = slots.filter((slot) => slot.date === "2026-08-26");
  assert.deepEqual(wednesday.map((s) => s.mealType), ["lunch", "dinner"]);
  assert.equal(wednesday[0].holidayName, "테스트공휴일");
  assert.equal(wednesday[0].isHoliday, true);
  // 공휴일이 아닌 평일은 그대로 저녁 하나다.
  assert.equal(slots.filter((s) => s.date === "2026-08-25").length, 1);
});

test("같은 날은 점심이 저녁보다 앞에 온다", () => {
  // 순서가 뒤집히면 "저녁에 쓴 재료가 그날 점심에 없다"는 결과가 나온다.
  const saturday = buildWeekSlots(MONDAY).filter(
    (slot) => slot.date === "2026-08-29",
  );
  assert.equal(saturday[0].mealType, "lunch");
  assert.equal(saturday[1].mealType, "dinner");
});

// ---------------------------------------------------------------------------
// FR-13-01 — 연쇄 계산
// ---------------------------------------------------------------------------

test("앞 칸이 쓴 재료는 뒤 칸의 가상 재고에서 빠진다 (FR-13-01)", () => {
  // 재고에 소고기 한 덩이뿐이고 두 레시피가 모두 그것을 쓴다. 연쇄 계산이
  // 안 돌면 화요일도 "소고기 있음"으로 보여 매칭률 1이 나온다.
  const slots = buildWeekSlots(MONDAY).slice(0, 2); // 월·화 저녁
  const placed = placeWeek({
    slots,
    recipes: [
      recipe("r1", "가지볶음", ["소고기"]),
      recipe("r2", "나물무침", ["소고기"]),
    ],
    inventory: stock("소고기"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
  });

  assert.deepEqual(placed[0].availableBefore, ["소고기"]);
  assert.deepEqual(placed[0].consumed, ["소고기"]);
  assert.equal(placed[0].score.matchRate, 1);

  // 화요일 시점에는 이미 없다 — 이게 연쇄 계산의 증거다.
  assert.deepEqual(placed[1].availableBefore, []);
  assert.equal(placed[1].score.matchRate, 0);
  assert.deepEqual(placed[1].score.missingMainIngredients, ["소고기"]);
});

test("가상 재고는 칸을 넘어가며 정확히 소비된 만큼만 줄어든다", () => {
  // 순위와 무관하게 성립해야 하는 불변식이라, 어떤 레시피가 뽑히든 검증된다.
  const placed = placeWeek({
    slots: buildWeekSlots(MONDAY),
    recipes: [
      recipe("r1", "감자조림", ["감자"]),
      recipe("r2", "무국", ["무"]),
      recipe("r3", "계란말이", ["계란"]),
      recipe("r4", "두부부침", ["두부"]),
      recipe("r5", "된장찌개", ["두부", "감자"]),
      recipe("r6", "김치볶음", ["김치"]),
      recipe("r7", "미역국", ["미역"]),
      recipe("r8", "콩나물국", ["콩나물"]),
      recipe("r9", "시금치나물", ["시금치"]),
      recipe("r10", "애호박전", ["애호박"]),
    ],
    inventory: stock("감자", "무", "계란", "두부", "김치"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
  });

  for (let i = 1; i < placed.length; i += 1) {
    const expected = [...placed[i - 1].availableBefore]
      .filter((name) => !placed[i - 1].consumed.includes(name))
      .sort();
    assert.deepEqual(
      [...placed[i].availableBefore].sort(),
      expected,
      `${placed[i].date} ${placed[i].mealType} 칸의 가상 재고가 어긋났다`,
    );
  }
});

test("같은 재료를 여러 번 샀으면 한 끼가 한 행만 덜어낸다", () => {
  // 우유 3팩을 샀는데 한 끼로 세 팩이 다 사라지면, 남은 재고가 실제보다
  // 적게 보여 뒤 요일 추천이 통째로 틀어진다.
  const slots = buildWeekSlots(MONDAY).slice(0, 2);
  const placed = placeWeek({
    slots,
    recipes: [recipe("r1", "우유죽", ["우유"]), recipe("r2", "우유빵", ["우유"])],
    inventory: stock("우유", "우유", "우유"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
  });

  assert.deepEqual(placed[0].consumed, ["우유"]);
  assert.deepEqual(placed[1].availableBefore, ["우유"]); // Set이라 중복은 접힌다
  // 두 끼를 먹고도 한 팩이 남아야 한다.
  assert.deepEqual(placed[1].consumed, ["우유"]);
});

test("재고에 없는 주재료는 덜어낼 것 없이 장보기 후보로 남는다 (FR-13-05)", () => {
  const placed = placeWeek({
    slots: buildWeekSlots(MONDAY).slice(0, 1),
    recipes: [recipe("r1", "된장찌개", ["두부", "애호박", "감자"])],
    inventory: stock("두부"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
  });

  assert.deepEqual(placed[0].consumed, ["두부"]);
  assert.deepEqual(
    placed[0].score.missingMainIngredients.sort(),
    ["감자", "애호박"],
  );
});

// ---------------------------------------------------------------------------
// FR-13-02 — 중복 금지
// ---------------------------------------------------------------------------

test("같은 주에 같은 레시피가 두 번 배치되지 않는다 (FR-13-02)", () => {
  const slots = buildWeekSlots(MONDAY); // 9끼니 × 최대 3요리
  const placed = placeWeek({
    slots,
    recipes: [
      ...Array.from({ length: 15 }, (_, i) =>
        recipe(`s${i}`, `국${i}`, ["감자"], "국&찌개"),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        recipe(`b${i}`, `반찬${i}`, ["감자"]),
      ),
    ],
    inventory: stock("감자"),
    purchaseShares: NO_HISTORY,
  });

  const ids = placed.flatMap((dish) => (dish.recipe ? [dish.recipe.id] : []));
  assert.equal(new Set(ids).size, ids.length);
});

test("한 끼니가 국 하나에 반찬 둘로 차려진다 (FR-13-08)", () => {
  const placed = placeWeek({
    slots: buildWeekSlots(MONDAY).slice(0, 1),
    recipes: [
      recipe("s1", "된장찌개", ["두부"], "국&찌개"),
      recipe("b1", "감자조림", ["감자"]),
      recipe("b2", "계란말이", ["계란"]),
      recipe("b3", "시금치나물", ["시금치"]),
    ],
    inventory: stock("두부", "감자", "계란"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
  });

  assert.equal(placed.length, 3);
  assert.deepEqual(
    placed.map((dish) => dish.role).sort(),
    ["side", "side", "soup"],
  );
});

test("일품이 뽑히면 그 하나로 끝난다 (FR-13-08)", () => {
  // 볶음밥 한 그릇에 국과 반찬을 또 붙이면 과하다.
  const placed = placeWeek({
    slots: buildWeekSlots(MONDAY).slice(0, 1),
    recipes: [
      recipe("m1", "가지볶음밥", ["감자", "계란", "두부"], "일품"),
      recipe("s1", "된장찌개", ["없는재료"], "국&찌개"),
      recipe("b1", "나물무침", ["없는재료2"]),
    ],
    inventory: stock("감자", "계란", "두부"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
  });

  assert.equal(placed.length, 1);
  assert.equal(placed[0].role, "main");
  assert.equal(placed[0].recipe.id, "m1");
});

test("그 자리에 맞는 후보가 없으면 그 자리만 비운다", () => {
  // 국 후보가 하나도 없다고 반찬까지 못 놓으면 안 된다.
  const placed = placeWeek({
    slots: buildWeekSlots(MONDAY).slice(0, 1),
    recipes: [
      recipe("b1", "감자조림", ["감자"]),
      recipe("b2", "계란말이", ["계란"]),
    ],
    inventory: stock("감자", "계란"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
  });

  assert.ok(placed.length >= 1);
  assert.equal(placed.filter((d) => d.role === "soup").length, 0);
});

test("레시피가 칸 수보다 적으면 중복을 허용해서라도 칸을 채운다", () => {
  // FR-13-02(중복 금지)와 FR-13-03(빈 칸 금지)이 부딪히는 유일한 지점.
  // 빈 칸을 만드는 쪽이 더 나쁘다 — 무엇을 먹을지가 정해져야 장보기로 이어진다.
  const slots = buildWeekSlots(MONDAY); // 9칸
  const placed = placeWeek({
    slots,
    recipes: [recipe("r1", "김치찌개", ["김치"]), recipe("r2", "계란말이", ["계란"])],
    inventory: stock("김치"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
  });

  // 끼니마다 첫 요리는 반드시 들어간다 — 자리 지정 후보가 마르면 그 자리만 빈다.
  const bySlot = new Set(placed.map((d) => `${d.date}|${d.mealType}`));
  assert.equal(bySlot.size, 9);
});

// ---------------------------------------------------------------------------
// FR-13-03 — 빈 칸 금지
// ---------------------------------------------------------------------------

test("재고가 완전히 비어도 모든 칸이 채워진다 (FR-13-03)", () => {
  const slots = buildWeekSlots(MONDAY);
  const placed = placeWeek({
    slots,
    recipes: [
      recipe("r1", "감자조림", ["감자"]),
      recipe("r2", "김치찌개", ["김치"]),
      recipe("r3", "계란말이", ["계란"]),
      recipe("r4", "된장국", ["두부"]),
      recipe("r5", "잡채", ["당면"]),
      recipe("r6", "제육볶음", ["돼지고기"]),
      recipe("r7", "미역국", ["미역"]),
      recipe("r8", "불고기", ["소고기"]),
      recipe("r9", "닭볶음탕", ["닭고기"]),
    ],
    inventory: [],
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
  });

  assert.equal(new Set(placed.map((d) => `${d.date}|${d.mealType}`)).size, slots.length);
  assert.ok(placed.every((dish) => dish.score.matchRate === 0));
});

test("레시피가 아예 없으면 조용히 빈 주를 만들지 않고 알린다", () => {
  assert.throws(
    () =>
      placeWeek({
        slots: buildWeekSlots(MONDAY),
        recipes: [],
        inventory: stock("감자"),
        purchaseShares: NO_HISTORY,
        config: NO_CONVENIENCE,
      }),
    /레시피가 없습니다/,
  );
});

// ---------------------------------------------------------------------------
// 결정성 — 새로고침할 때마다 식단표가 바뀌면 안 된다
// ---------------------------------------------------------------------------

test("같은 입력이면 언제나 같은 식단표가 나온다", () => {
  const input = () => ({
    slots: buildWeekSlots(MONDAY),
    // 전부 동점이 되는 상황이 결정성이 가장 위험한 지점이다.
    recipes: Array.from({ length: 20 }, (_, i) =>
      recipe(`r${i}`, `레시피${String(i).padStart(2, "0")}`, ["없는재료"]),
    ),
    inventory: [],
    purchaseShares: NO_HISTORY,
  });

  const ids = (dishes) =>
    dishes.map((dish) => dish.recipe?.id ?? dish.convenience.key);
  assert.deepEqual(ids(placeWeek(input())), ids(placeWeek(input())));
});

// ---------------------------------------------------------------------------
// 재생성 시 사용자 편집 보존 (FR-12-01)
// ---------------------------------------------------------------------------

test("고정된 칸은 재생성해도 그 레시피와 source를 유지한다", () => {
  const slots = buildWeekSlots(MONDAY).slice(0, 3);
  const placed = placeWeek({
    slots,
    recipes: [
      recipe("r1", "감자조림", ["감자"]),
      recipe("r2", "김치찌개", ["김치"]),
      recipe("r3", "계란말이", ["계란"]),
    ],
    inventory: stock("감자", "김치", "계란"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
    locked: new Map([
      [
        slotKey(slots[0].date, slots[0].mealType),
        [{ recipeId: "r3", role: "side", source: "manual" }],
      ],
    ]),
  });

  assert.equal(placed[0].recipe.id, "r3");
  assert.equal(placed[0].source, "manual");
  assert.ok(placed.slice(1).every((dish) => dish.source === "auto"));
});

test("고정된 레시피가 사라졌으면 칸을 비우지 않고 자동 배치로 되돌린다", () => {
  const slots = buildWeekSlots(MONDAY).slice(0, 1);
  const placed = placeWeek({
    slots,
    recipes: [recipe("r1", "감자조림", ["감자"])],
    inventory: stock("감자"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
    locked: new Map([
      [
        slotKey(slots[0].date, slots[0].mealType),
        [{ recipeId: "지워진id", role: "side", source: "manual" }],
      ],
    ]),
  });

  assert.equal(placed[0].recipe.id, "r1");
  assert.equal(placed[0].source, "auto");
});

// ---------------------------------------------------------------------------
// replayWeek — 저장된 주를 현재 재고로 다시 훑기
// ---------------------------------------------------------------------------

test("저장된 배치는 그대로 두고 매칭 정보만 현재 재고로 갱신한다", () => {
  const entries = [
    {
      date: "2026-08-24",
      mealType: "dinner",
      isHoliday: false,
      holidayName: null,
      recipeId: "r1",
      role: "side",
      source: "auto",
    },
    {
      date: "2026-08-25",
      mealType: "dinner",
      isHoliday: false,
      holidayName: null,
      recipeId: "r2",
      role: "side",
      source: "swapped",
    },
  ];

  const placed = replayWeek(
    entries,
    [recipe("r1", "감자조림", ["감자"]), recipe("r2", "감자전", ["감자"])],
    stock("감자"), // 감자가 한 알뿐이다
    NO_HISTORY,
  );

  // 배치 자체는 저장된 그대로.
  assert.deepEqual(placed.map((s) => s.recipe.id), ["r1", "r2"]);
  assert.equal(placed[1].source, "swapped");
  // 월요일이 감자를 쓰므로 화요일 입장에서는 없다 — 장보기 후보로 뜬다.
  assert.equal(placed[0].score.matchRate, 1);
  assert.equal(placed[1].score.matchRate, 0);
  assert.deepEqual(placed[1].score.missingMainIngredients, ["감자"]);
});

test("레시피가 지워진 칸은 건너뛴다", () => {
  const placed = replayWeek(
    [
      {
        date: "2026-08-24",
        mealType: "dinner",
        isHoliday: false,
        holidayName: null,
        recipeId: "사라진id",
        role: "side",
        source: "auto",
      },
    ],
    [recipe("r1", "감자조림", ["감자"])],
    stock("감자"),
    NO_HISTORY,
  );

  assert.equal(placed.length, 0);
});

// ---------------------------------------------------------------------------
// FR-13-10 — 간편조리식
// ---------------------------------------------------------------------------

test("한 주에 간편식이 설정한 수만큼 들어간다 (FR-13-10)", () => {
  const placed = placeWeek({
    slots: buildWeekSlots(MONDAY), // 9끼니
    recipes: Array.from({ length: 40 }, (_, i) =>
      recipe(`b${i}`, `반찬${i}`, ["감자"]),
    ),
    // 재고가 끼니 수보다 적으면 간편식이 늘어난다(FR-13-11). 여기서는
    // 기본 개수를 보는 테스트라 넉넉히 준다.
    inventory: stock(...Array(12).fill("감자")),
    purchaseShares: NO_HISTORY,
  });

  const convenience = placed.filter((d) => d.role === "convenience");
  assert.equal(convenience.length, DEFAULT_MEAL_PLAN_CONFIG.convenienceMealsPerWeek);
  assert.ok(convenience.every((d) => d.recipe === null));
  assert.ok(convenience.every((d) => d.convenience !== null));
});

test("간편식은 재료를 쓰지 않는다", () => {
  // 사서 데우기만 하므로 가상 재고가 줄면 안 된다. 줄면 뒤 요리들이
  // 있지도 않은 소비를 근거로 밀려난다.
  const placed = placeWeek({
    slots: buildWeekSlots(MONDAY),
    recipes: Array.from({ length: 40 }, (_, i) =>
      recipe(`b${i}`, `반찬${i}`, ["감자"]),
    ),
    inventory: stock(...Array(12).fill("감자")),
    purchaseShares: NO_HISTORY,
  });

  for (const dish of placed.filter((d) => d.role === "convenience")) {
    assert.deepEqual(dish.consumed, []);
    assert.deepEqual(dish.score.missingMainIngredients, []);
  }
});

test("간편식은 몰리지 않고 흩어진다", () => {
  // 이틀 연속 사 먹는 식단표는 "요리 안 하는 주"로 보인다.
  const placed = placeWeek({
    slots: buildWeekSlots(MONDAY),
    recipes: Array.from({ length: 40 }, (_, i) =>
      recipe(`b${i}`, `반찬${i}`, ["감자"]),
    ),
    inventory: stock(...Array(12).fill("감자")),
    purchaseShares: NO_HISTORY,
  });

  const keys = [
    ...new Set(
      placed
        .filter((d) => d.role === "convenience")
        .map((d) => `${d.date}|${d.mealType}`),
    ),
  ];
  const indexes = keys.map((key) =>
    buildWeekSlots(MONDAY).findIndex((s) => `${s.date}|${s.mealType}` === key),
  );
  assert.ok(
    Math.abs(indexes[1] - indexes[0]) >= 2,
    `간편식이 붙어 있다: ${indexes.join(", ")}`,
  );
});

test("주차가 다르면 다른 간편식이 제안된다", () => {
  const run = (weekSeed) =>
    placeWeek({
      slots: buildWeekSlots(MONDAY),
      recipes: Array.from({ length: 40 }, (_, i) =>
        recipe(`b${i}`, `반찬${i}`, ["감자"]),
      ),
      inventory: stock(...Array(12).fill("감자")),
      purchaseShares: NO_HISTORY,
      weekSeed,
    })
      .filter((d) => d.role === "convenience")
      .map((d) => d.convenience.key);

  assert.notDeepEqual(run(0), run(1));
});

// ---------------------------------------------------------------------------
// FR-13-09 — 재료 쏠림 완화
// ---------------------------------------------------------------------------

test("같은 재료만 쓰는 레시피가 계속 뽑히지 않는다 (FR-13-09)", () => {
  // 두부 요리 20개와 다른 재료 요리 20개를 두면, 감점이 없을 때는 두부가
  // 계속 이겨 한 주가 통째로 두부로 깔린다.
  const placed = placeWeek({
    slots: buildWeekSlots(MONDAY),
    recipes: [
      ...Array.from({ length: 20 }, (_, i) =>
        recipe(`t${i}`, `두부요리${i}`, ["두부"]),
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        recipe(`o${i}`, `다른요리${i}`, [`재료${i}`]),
      ),
    ],
    inventory: stock("두부"),
    purchaseShares: NO_HISTORY,
    config: NO_CONVENIENCE,
  });

  const tofuShare =
    placed.filter((d) => d.recipe?.id.startsWith("t")).length / placed.length;
  assert.ok(
    tofuShare < 0.9,
    `두부 요리 비중이 ${Math.round(tofuShare * 100)}%로 여전히 쏠린다`,
  );
});

test("간편식 목록의 키는 서로 겹치지 않는다", () => {
  const keys = CONVENIENCE_CATALOG.map((item) => item.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(CONVENIENCE_CATALOG.every((item) => item.name && item.note));
});

test("재고가 끼니 수보다 적으면 간편식을 늘린다 (FR-13-11)", () => {
  // 만들 수도 없는 요리를 줄줄이 늘어놓는 것보다 "사두면 편한 것"을 더
  // 제안하는 편이 낫다 — 어차피 장을 봐야 하는 상황이다.
  const recipes = Array.from({ length: 40 }, (_, i) =>
    recipe(`b${i}`, `반찬${i}`, [`재료${i}`]),
  );
  const slots = buildWeekSlots(MONDAY);

  const rich = placeWeek({
    slots,
    recipes,
    inventory: stock(...Array(12).fill("감자")),
    purchaseShares: NO_HISTORY,
  }).filter((d) => d.role === "convenience").length;

  const poor = placeWeek({
    slots,
    recipes,
    inventory: stock("감자"),
    purchaseShares: NO_HISTORY,
  }).filter((d) => d.role === "convenience").length;

  assert.ok(poor > rich, `재고가 적은데 간편식이 안 늘었다 (${poor} vs ${rich})`);
  assert.ok(poor <= DEFAULT_MEAL_PLAN_CONFIG.convenienceMealsMax);
});
