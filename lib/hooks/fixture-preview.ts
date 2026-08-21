"use client";

import {
  monthOf,
  outOfSeasonPurchases,
} from "@/lib/ingredients/seasonality";
import { useEffect, useState } from "react";
import type {
  CookChecklistResponse,
  InventoryListResponse,
  MealPlanCandidatesResponse,
  MealPlanResponse,
  MealPlanSlot,
  RecipeDetailResponse,
  RecipeListItem,
  RecipeListResponse,
  TodayRecipesResponse,
  UpdateMealPlanEntryResponse,
  WeeklyNutritionSummary,
} from "@/types/api";
import type { MealType } from "@/types/domain";
import { DEFAULT_MEAL_PLAN_CONFIG } from "@/lib/meal-plan/config";
import {
  addDays,
  dayOfWeek,
  isISODate,
  seoulToday,
  weekDates,
  weekEndOf,
  weekIndexOf,
  weekStartOf,
} from "@/components/meal-plan/week";

/**
 * Local visual-preview switch for the screens track.
 *
 * The 재고/홈/레시피 screens are built against the published `/api/inventory`
 * and `/api/recipes*` contracts, but those routes land in a different
 * worktree. Appending `?preview=fixtures` to any screen makes the inventory
 * and recipe hooks read `fixtures/inventory.json` / `fixtures/recipes.json`
 * instead of the network; `?preview=empty` renders the "nothing synced yet"
 * state. `?preview=off` clears it.
 *
 * The flag is kept in sessionStorage so it survives tab navigation, and the
 * screens badge themselves ("미리보기 데이터") whenever it is on — preview data
 * must never be mistaken for a real household's inventory.
 */
export type FixturePreviewMode = "off" | "fixtures" | "empty";

const PREVIEW_PARAM = "preview";
const STORAGE_KEY = "npg:fixture-preview";

function isMode(value: string | null): value is FixturePreviewMode {
  return value === "off" || value === "fixtures" || value === "empty";
}

export function fixturePreviewMode(): FixturePreviewMode {
  if (typeof window === "undefined") return "off";
  try {
    const param = new URLSearchParams(window.location.search).get(PREVIEW_PARAM);
    if (isMode(param)) {
      if (param === "off") window.sessionStorage.removeItem(STORAGE_KEY);
      else window.sessionStorage.setItem(STORAGE_KEY, param);
      return param;
    }
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return isMode(stored) ? stored : "off";
  } catch {
    return "off";
  }
}

export function isFixturePreview(): boolean {
  return fixturePreviewMode() !== "off";
}

/** Render-safe reader: always false on the server pass, resolved after mount. */
export function useFixturePreview(): boolean {
  const [preview, setPreview] = useState(false);
  useEffect(() => setPreview(isFixturePreview()), []);
  return preview;
}

export async function loadInventoryFixture(): Promise<InventoryListResponse> {
  if (fixturePreviewMode() === "empty") return { items: [] };
  const fixture = (await import("@/fixtures/inventory.json")).default;
  // The fixture is plain JSON, so TS widens its literal unions to `string`.
  return { items: (fixture as unknown as InventoryListResponse).items };
}

// ---------------------------------------------------------------------------
// M2 — recipes
//
// `fixtures/recipes.json` ships one full detail + one cook checklist (for the
// top-scoring recipe). The other list entries get a detail/checklist derived
// from their own RecipeMatch, so the 부족 재료 and 밀키트 CTA branches can be
// looked at on screen too. Same flag, same badge — no second switch.
// ---------------------------------------------------------------------------

interface RecipesFixture {
  recipes: RecipeListItem[];
  detail: RecipeDetailResponse;
  cookChecklist: CookChecklistResponse;
}

async function loadRecipesFixtureFile(): Promise<RecipesFixture> {
  const fixture = (await import("@/fixtures/recipes.json")).default;
  return fixture as unknown as RecipesFixture;
}

export async function loadRecipeListFixture(): Promise<RecipeListResponse> {
  if (fixturePreviewMode() === "empty") return { recipes: [] };
  const { recipes } = await loadRecipesFixtureFile();
  return { recipes };
}

/** 오늘의 추천 — 목록 상위 세 개를 그날의 큐레이션으로 본다 (FR-09-01). */
export async function loadTodayRecipesFixture(): Promise<TodayRecipesResponse> {
  const date = new Date().toISOString().slice(0, 10);
  if (fixturePreviewMode() === "empty") return { date, recipes: [] };
  const { recipes } = await loadRecipesFixtureFile();
  return { date, recipes: recipes.slice(0, 3) };
}

/** 파생 상세에 붙는 기본 조미료 — 화이트리스트라 매칭에서 빠진다는 걸 보여준다. */
const DERIVED_SEASONINGS = ["소금", "간장", "참기름"];

export async function loadRecipeDetailFixture(
  id: string,
): Promise<RecipeDetailResponse> {
  const { recipes, detail } = await loadRecipesFixtureFile();
  if (id === detail.id) return detail;

  const listItem = recipes.find((recipe) => recipe.id === id);
  if (!listItem) {
    throw new Error("샘플 데이터에 없는 레시피예요. (?preview=off 로 끄기)");
  }

  return {
    id: listItem.id,
    name: listItem.name,
    imageUrl: listItem.imageUrl,
    // 사진이 없는 단계도 화면에서 어떻게 보이는지 확인할 수 있어야 한다 —
    // 실데이터는 100% 사진이 있지만, 다른 소스가 붙으면 빌 수 있다.
    instructions: [
      {
        text: `${listItem.match.ownedMainIngredients.join(", ") || "재료"}를 먹기 좋은 크기로 손질한다.`,
        imageUrl: null,
      },
      { text: "달군 팬에 재료를 넣고 중불에서 볶는다.", imageUrl: null },
      { text: "간을 맞추고 한소끔 더 익혀 마무리한다.", imageUrl: null },
    ],
    nutrition: {
      calories: listItem.calories,
      carbohydrate: null,
      protein: null,
      fat: null,
      sodium: null,
    },
    ingredients: [
      ...listItem.match.ownedMainIngredients.map((name) => ({
        normalizedName: name,
        role: "main" as const,
        isWhitelistedSeasoning: false,
        inStock: true,
      })),
      ...listItem.match.missingMainIngredients.map((name) => ({
        normalizedName: name,
        role: "main" as const,
        isWhitelistedSeasoning: false,
        inStock: false,
      })),
      ...DERIVED_SEASONINGS.map((name) => ({
        normalizedName: name,
        role: "seasoning" as const,
        isWhitelistedSeasoning: true,
        inStock: false,
      })),
    ],
    match: listItem.match,
    showMealKitCta: listItem.showMealKitCta,
  };
}

export async function loadCookChecklistFixture(
  id: string,
): Promise<CookChecklistResponse> {
  const { recipes, detail, cookChecklist } = await loadRecipesFixtureFile();
  if (id === detail.id) return cookChecklist;

  const listItem = recipes.find((recipe) => recipe.id === id);
  if (!listItem) return { items: [] };

  return {
    items: listItem.match.ownedMainIngredients.map((name, index) => ({
      inventoryItemId: `preview-${listItem.id}-${index}`,
      normalizedName: name,
      rawName: `${name} (샘플 재고)`,
      quantity: "1개",
      daysSincePurchase: 3 + index * 4,
    })),
  };
}

// ---------------------------------------------------------------------------
// M3 — 주간 식단표
//
// 배치 엔진은 다른 워크트리에서 만들어지는 중이라, 화면은 이 픽스처 위에서
// 먼저 완성한다. 픽스처는 "예쁜 주"를 만들지 않는다 — 실제로 화면을 망가뜨릴 수
// 있는 네 가지를 매주 반드시 포함시킨다.
//
//   (1) 평일에 낀 공휴일 → 그 날만 점심+저녁 2칸
//   (2) 매칭률 14%짜리 끼니 → FR-13-03이 빈 칸을 안 만들기 때문에 실제로 나온다
//   (3) 영양정보가 없는 레시피 → coveredSlots < totalSlots (FR-14-01)
//   (4) 부족 재료가 5~6개인 끼니 → 장보기 후보 표시가 넘치지 않는지
//
// 이 네 가지가 없는 픽스처는 "잘 되는 것처럼 보이게" 만들 뿐이라 쓸모가 없다.
// ---------------------------------------------------------------------------

interface FixtureNutrition {
  calories: number;
  carbohydrate: number;
  protein: number;
  fat: number;
  sodium: number;
}

interface MealPlanFixtureRecipe {
  recipe: RecipeListItem;
  /** null = 식약처 원본에 영양정보가 없는 레시피. 주간 합계에서 빠진다. */
  nutrition: FixtureNutrition | null;
}

/**
 * 매칭률·칼로리·밀키트 CTA를 손으로 각각 적으면 서로 어긋난 픽스처가 나온다
 * (매칭률 100%인데 부족 재료가 있다든지). 재료 목록에서 파생시켜 항상 맞게 둔다.
 */
function mealPlanRecipe(
  seq: number,
  name: string,
  owned: string[],
  missing: string[],
  expiring: string[],
  nutrition: FixtureNutrition | null,
  category: string | null = "반찬",
): MealPlanFixtureRecipe {
  const total = owned.length + missing.length;
  const matchRate = total === 0 ? 0 : owned.length / total;
  return {
    recipe: {
      id: `mp-recipe-${String(seq).padStart(2, "0")}`,
      name,
      imageUrl: null,
      calories: nutrition?.calories ?? null,
      category,
      match: {
        // 목록 점수와 식단표 점수는 원래 다르지만(가상 재고 위 계산),
        // 픽스처에선 매칭률에서 살짝 흔들어 둔 값이면 충분하다.
        score: Number((matchRate * 0.8 + 0.15).toFixed(2)),
        matchRate: Number(matchRate.toFixed(2)),
        ownedMainIngredients: owned,
        missingMainIngredients: missing,
        usesExpiringIngredients: expiring,
      },
      showMealKitCta: matchRate >= 0.3 && matchRate < 0.7,
    },
    nutrition,
  };
}

const MEAL_PLAN_POOL: MealPlanFixtureRecipe[] = [
  mealPlanRecipe(1, "돼지고기 김치찌개", ["돼지고기", "김치", "두부", "대파"], [], ["두부", "대파"], { calories: 420, carbohydrate: 18, protein: 26, fat: 24, sodium: 1450 }),
  mealPlanRecipe(2, "계란말이", ["계란", "대파", "당근"], [], ["대파"], { calories: 210, carbohydrate: 6, protein: 14, fat: 14, sodium: 520 }),
  mealPlanRecipe(3, "소고기 미역국", ["소고기", "미역"], [], ["미역"], { calories: 180, carbohydrate: 9, protein: 15, fat: 8, sodium: 890 }),
  mealPlanRecipe(4, "애호박 새우젓볶음", ["애호박"], ["새우젓"], ["애호박"], { calories: 120, carbohydrate: 8, protein: 4, fat: 7, sodium: 610 }),
  // (3) 영양정보 없음 — 주간 합계의 "N끼 기준" 문구가 여기서 검증된다.
  mealPlanRecipe(5, "연어 스테이크", ["연어", "상추"], ["레몬", "아스파라거스"], ["연어"], null),
  mealPlanRecipe(6, "두부조림", ["두부", "양파"], [], ["두부"], { calories: 230, carbohydrate: 10, protein: 16, fat: 13, sodium: 980 }),
  mealPlanRecipe(7, "고등어 무조림", ["고등어"], ["무", "청양고추"], ["고등어"], { calories: 310, carbohydrate: 12, protein: 24, fat: 17, sodium: 1120 }),
  mealPlanRecipe(8, "콩나물국밥", ["콩나물", "계란"], [], ["콩나물"], { calories: 260, carbohydrate: 38, protein: 12, fat: 5, sodium: 1240 }),
  mealPlanRecipe(9, "제육볶음", ["돼지고기", "양파", "양배추"], ["고추장"], ["양배추"], { calories: 520, carbohydrate: 22, protein: 30, fat: 32, sodium: 1580 }),
  mealPlanRecipe(10, "감자채볶음", ["감자", "당근"], [], ["감자"], { calories: 170, carbohydrate: 26, protein: 3, fat: 6, sodium: 430 }),
  // (3) 영양정보 없음 — 두 번째.
  mealPlanRecipe(11, "오징어볶음", ["오징어"], ["양배추", "당근", "대파"], ["오징어"], null),
  mealPlanRecipe(12, "시금치나물", ["시금치"], [], ["시금치"], { calories: 60, carbohydrate: 5, protein: 3, fat: 3, sodium: 320 }),
  mealPlanRecipe(13, "닭볶음탕", ["닭고기", "감자"], ["당근", "대파"], ["닭고기"], { calories: 610, carbohydrate: 30, protein: 38, fat: 32, sodium: 1690 }),
  mealPlanRecipe(14, "순두부찌개", ["순두부", "계란"], ["바지락"], ["순두부"], { calories: 280, carbohydrate: 12, protein: 20, fat: 16, sodium: 1330 }),
  // (4) 부족 재료 5개.
  mealPlanRecipe(15, "잡채", ["당면"], ["시금치", "목이버섯", "소고기", "양파", "당근"], [], { calories: 480, carbohydrate: 72, protein: 14, fat: 12, sodium: 980 }),
  // (2) 매칭률 14% — 1/7. 엔진이 빈 칸을 안 만들어서 실제로 배치되는 종류의 칸.
  mealPlanRecipe(16, "해물파전", ["부추"], ["오징어", "새우", "홍합", "밀가루", "계란", "쪽파"], [], { calories: 430, carbohydrate: 52, protein: 18, fat: 16, sodium: 1210 }),
  mealPlanRecipe(17, "카레라이스", ["감자", "당근", "양파"], ["카레가루", "돼지고기"], ["감자"], { calories: 590, carbohydrate: 88, protein: 18, fat: 17, sodium: 1250 }),
  mealPlanRecipe(18, "미나리 삼겹살", ["삼겹살"], ["미나리", "버섯"], ["삼겹살"], { calories: 720, carbohydrate: 8, protein: 34, fat: 60, sodium: 890 }),
  mealPlanRecipe(19, "김치볶음밥", ["김치", "밥", "계란"], [], ["김치"], { calories: 520, carbohydrate: 74, protein: 15, fat: 17, sodium: 1420 }),
  // (3) 영양정보 없음 — 세 번째.
  mealPlanRecipe(20, "가지볶음", ["가지", "양파"], [], ["가지"], null),
  // (5) 제철 아닌 재료를 사야 하는 끼니 (FR-13-07). 감귤은 11~2월이 제철이라
  // 나머지 여덟 달 동안 "지금 제철이 아니에요" 문구가 화면에 뜬다.
  // 이 항목이 없으면 그 문구를 1년에 넉 달만 눈으로 볼 수 있다.
  mealPlanRecipe(21, "감귤 콩샐러드", ["양배추"], ["감귤", "병아리콩"], [], { calories: 240, carbohydrate: 34, protein: 9, fat: 7, sodium: 260 }),
];

/**
 * 위험 케이스의 풀 인덱스: 해물파전(14%) · 잡채(부족 5개) · 연어(영양 없음) ·
 * 감귤 콩샐러드(제철 아님).
 */
const SHOWCASE_POOL_INDEXES = [15, 14, 4, 20];
/**
 * 그 세 개를 그 주의 몇 번째 칸에 꽂을지. 회전만 시키면 어떤 주에는 안 나와서
 * "오늘은 잘 보이네" 하고 넘어가게 된다. 매주 같은 자리에 고정해 둔다.
 */
const SHOWCASE_SLOT_INDEXES = [2, 4, 5, 6];

/**
 * 픽스처 모드에서 사용자가 바꾼 칸. 백엔드가 없으니 세션 메모리에 들고 있어야
 * 교체 후 다시 불러도 그대로 남아 있다 (실제 API의 저장을 흉내 내는 자리).
 */
const mealPlanSwaps = new Map<
  string,
  { recipe: RecipeListItem; source: "swapped" | "manual" }
>();

/** 재생성할 때마다 늘려서 배치 결과를 실제로 바꿔 보여준다. */
let mealPlanRegenerationSeed = 0;

/** 공휴일 표. 매년 날짜가 같은 것만 — 픽스처에 음력 계산까지 넣을 이유는 없다. */
const FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "성탄절",
};

function fixedHolidayName(date: string): string | null {
  return FIXED_HOLIDAYS[date.slice(5)] ?? null;
}

/**
 * 이번 주가 아니면 공휴일 조회가 실패한 것으로 친다. 조용한 안내가 식단표를
 * 막지 않는지 눈으로 확인하려고 일부러 갈라놓은 것이고, 실제 API와는 무관하다.
 */
function isDegradedFixtureWeek(weekStart: string): boolean {
  return weekStart !== weekStartOf(seoulToday());
}

/**
 * 그 주의 공휴일 지도. 표에 걸리는 평일 공휴일이 하나도 없으면 수요일을
 * 임시공휴일로 만든다 — (1)번 위험 케이스(평일 2끼)를 매주 눈으로 확인해야
 * 하기 때문이다. 실제 API는 당연히 이런 짓을 하지 않는다.
 *
 * 공휴일 조회가 실패한 주(degraded)에는 아무것도 넣지 않는다. 안내는 "못
 * 받아왔다"고 하는데 공휴일 배지가 떠 있으면 화면이 앞뒤가 안 맞는다.
 */
function holidayMapForWeek(weekStart: string): Map<string, string> {
  const map = new Map<string, string>();
  if (isDegradedFixtureWeek(weekStart)) return map;
  let hasWeekdayHoliday = false;

  for (const date of weekDates(weekStart)) {
    const name = fixedHolidayName(date);
    if (!name) continue;
    map.set(date, name);
    const day = dayOfWeek(date);
    if (day !== 0 && day !== 6) hasWeekdayHoliday = true;
  }

  if (!hasWeekdayHoliday) {
    map.set(addDays(weekStart, 2), "임시공휴일");
  }
  return map;
}

/** FR-11-01: 평일은 저녁만, 주말·공휴일은 점심+저녁. */
function mealTypesFor(date: string, isHoliday: boolean): MealType[] {
  const day = dayOfWeek(date);
  const isWeekendDay = day === 0 || day === 6;
  return isWeekendDay || isHoliday ? ["lunch", "dinner"] : ["dinner"];
}

export function mealPlanFixtureEntryId(date: string, mealType: MealType): string {
  return `mp-${date}-${mealType}`;
}

/** entryId → 날짜. 후보 목록이 "그 주에 이미 쓴 레시피"를 알아야 해서 필요하다. */
function dateFromEntryId(entryId: string): string | null {
  const matched = /^mp-(\d{4}-\d{2}-\d{2})-(lunch|dinner)$/.exec(entryId);
  if (!matched || !isISODate(matched[1])) return null;
  return matched[1];
}

/**
 * 칸 수만큼 레시피를 고른다. 위험 케이스 세 개를 먼저 자리에 꽂고, 나머지는
 * 주차·재생성 횟수로 회전시킨 순번에서 연속으로 뽑는다. 연속으로 뽑기 때문에
 * 같은 주에 같은 레시피가 두 번 들어가지 않는다 (FR-13-02).
 */
function assignPoolRecipes(
  slotCount: number,
  rotation: number,
): MealPlanFixtureRecipe[] {
  const assigned: (MealPlanFixtureRecipe | null)[] = Array.from(
    { length: slotCount },
    () => null,
  );
  const usedPoolIndexes = new Set<number>();

  SHOWCASE_SLOT_INDEXES.forEach((slotIndex, order) => {
    if (slotIndex >= slotCount) return;
    const poolIndex = SHOWCASE_POOL_INDEXES[order];
    assigned[slotIndex] = MEAL_PLAN_POOL[poolIndex];
    usedPoolIndexes.add(poolIndex);
  });

  const rest = MEAL_PLAN_POOL.map((_, index) => index).filter(
    (index) => !usedPoolIndexes.has(index),
  );
  const offset = ((rotation % rest.length) + rest.length) % rest.length;

  let taken = 0;
  return assigned.map((entry) => {
    if (entry) return entry;
    const poolIndex = rest[(offset + taken) % rest.length];
    taken += 1;
    return MEAL_PLAN_POOL[poolIndex];
  });
}

function emptyNutrition(totalSlots: number): WeeklyNutritionSummary {
  return {
    calories: 0,
    carbohydrate: 0,
    protein: 0,
    fat: 0,
    sodium: 0,
    coveredSlots: 0,
    totalSlots,
  };
}

const POOL_NUTRITION_BY_RECIPE_ID = new Map(
  MEAL_PLAN_POOL.map((entry) => [entry.recipe.id, entry.nutrition]),
);

/**
 * 주간 합계. 영양정보가 없는 레시피는 합계에서 빼고 coveredSlots도 올리지 않는다
 * — 없는 값을 0으로 더하면 "이번 주는 적게 먹네"가 되어 버린다 (FR-14-01).
 * 교체로 들어온 목록 밖 레시피도 여기서는 영양정보 없음으로 본다.
 */
function summarizeNutrition(slots: MealPlanSlot[]): WeeklyNutritionSummary {
  const summary = emptyNutrition(slots.length);
  for (const slot of slots) {
    const nutrition = POOL_NUTRITION_BY_RECIPE_ID.get(slot.recipe.id) ?? null;
    if (!nutrition) continue;
    summary.calories += nutrition.calories;
    summary.carbohydrate += nutrition.carbohydrate;
    summary.protein += nutrition.protein;
    summary.fat += nutrition.fat;
    summary.sodium += nutrition.sodium;
    summary.coveredSlots += 1;
  }
  return summary;
}

function buildFixtureWeek(weekStart: string): MealPlanSlot[] {
  const holidays = holidayMapForWeek(weekStart);

  const blanks: { date: string; mealType: MealType; holidayName: string | null }[] =
    [];
  for (const date of weekDates(weekStart)) {
    const holidayName = holidays.get(date) ?? null;
    for (const mealType of mealTypesFor(date, holidayName !== null)) {
      blanks.push({ date, mealType, holidayName });
    }
  }

  // 주차·재생성 횟수로 회전시켜, 주를 넘기거나 다시 짜면 실제로 메뉴가 바뀐다.
  const recipes = assignPoolRecipes(
    blanks.length,
    weekIndexOf(weekStart) + mealPlanRegenerationSeed * 3,
  );

  return blanks.map((blank, index) => {
    const id = mealPlanFixtureEntryId(blank.date, blank.mealType);
    const swapped = mealPlanSwaps.get(id);
    const recipe = swapped?.recipe ?? recipes[index].recipe;

    return {
      id,
      date: blank.date,
      mealType: blank.mealType,
      isHoliday: blank.holidayName !== null,
      holidayName: blank.holidayName,
      recipe,
      matchScore: recipe.match.score,
      missingMainIngredients: recipe.match.missingMainIngredients,
      // FR-13-07: 픽스처에서도 제철 경고가 실제로 어떻게 보이는지 확인할 수
      // 있어야 한다. 부족 재료 중 이 달에 제철이 아닌 것을 그대로 계산한다.
      outOfSeasonIngredients: outOfSeasonPurchases(
        recipe.match.missingMainIngredients,
        monthOf(blank.date),
      ),
      source: swapped?.source ?? "auto",
    };
  });
}

export async function loadMealPlanFixture(
  weekStart?: string,
): Promise<MealPlanResponse> {
  const start = weekStartOf(
    weekStart && isISODate(weekStart) ? weekStart : seoulToday(),
  );

  if (fixturePreviewMode() === "empty") {
    return {
      weekStartDate: start,
      weekEndDate: weekEndOf(start),
      slots: [],
      nutrition: emptyNutrition(0),
      holidayLookupDegraded: false,
    };
  }

  const slots = buildFixtureWeek(start);
  return {
    weekStartDate: start,
    weekEndDate: weekEndOf(start),
    slots,
    nutrition: summarizeNutrition(slots),
    // 이번 주는 정상, 다른 주로 넘기면 조용한 안내가 뜬다 — 그 안내가 식단표를
    // 막지 않는지 눈으로 확인하려고 일부러 이렇게 갈라놨다.
    holidayLookupDegraded: start !== weekStartOf(seoulToday()),
  };
}

/** FR-12-02: 이미 그 주에 배치된 레시피는 후보에서 뺀다 (FR-13-02). */
export async function loadMealPlanCandidatesFixture(
  entryId: string,
): Promise<MealPlanCandidatesResponse> {
  const date = dateFromEntryId(entryId);
  const slots = date ? buildFixtureWeek(weekStartOf(date)) : [];
  const current = slots.find((slot) => slot.id === entryId);
  const placedIds = new Set(slots.map((slot) => slot.recipe.id));

  const candidates = MEAL_PLAN_POOL.filter(
    (entry) => !placedIds.has(entry.recipe.id),
  )
    .map((entry) => entry.recipe)
    .slice(0, DEFAULT_MEAL_PLAN_CONFIG.swapCandidateCount);

  return {
    currentRecipeId: current?.recipe.id ?? "",
    candidates,
  };
}

/**
 * PATCH 흉내. 실제 서버는 source를 스스로 정하지만(후보=swapped, 검색=manual),
 * 픽스처에는 후보 목록의 기억이 없으므로 호출한 쪽이 알려준다.
 */
export async function updateMealPlanEntryFixture(
  entryId: string,
  recipe: RecipeListItem,
  source: "swapped" | "manual",
): Promise<UpdateMealPlanEntryResponse> {
  await new Promise((resolve) => setTimeout(resolve, 350));
  mealPlanSwaps.set(entryId, { recipe, source });

  const date = dateFromEntryId(entryId);
  const slots = date ? buildFixtureWeek(weekStartOf(date)) : [];
  const slot = slots.find((entry) => entry.id === entryId);
  if (!slot) {
    throw new Error("샘플 데이터에 없는 끼니예요. (?preview=off 로 끄기)");
  }

  return { slot, nutrition: summarizeNutrition(slots) };
}

/** FR-12-01 재생성. includeEdited면 손댄 칸까지 초기화한다. */
export async function regenerateMealPlanFixture(
  weekStart: string,
  includeEdited: boolean,
): Promise<MealPlanResponse> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  mealPlanRegenerationSeed += 1;

  if (includeEdited) {
    for (const date of weekDates(weekStartOf(weekStart))) {
      mealPlanSwaps.delete(mealPlanFixtureEntryId(date, "lunch"));
      mealPlanSwaps.delete(mealPlanFixtureEntryId(date, "dinner"));
    }
  }

  return loadMealPlanFixture(weekStart);
}
