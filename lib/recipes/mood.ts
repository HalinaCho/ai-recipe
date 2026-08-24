// FR-09-08: "오늘 뭐 땡겨요" 무드 필터.
//
// FR-09-03 종류 필터(반찬·국&찌개·일품·밥·후식·기타)는 "무엇을 만들 수
// 있는가"의 축이지 "오늘 어떤 기분인가"의 축이 아니다. 이 파일은 그 두 번째
// 축을 규칙 기반으로 계산한다 — LLM 재태깅 없이 이미 있는 필드(칼로리·주재료
// 개수·재료명)만 쓴다. isWhitelistedSeasoning(FR-07-02)이 이미 이런 키워드
// 목록 방식으로 잘 동작하고 있어 같은 패턴을 따른다.
//
// 실제 데이터(전체 1,156개)로 확인한 분포: 든든하게 240개(21%)·간단하게
// 305개(26%)·매콤하게 72개(6%)·담백하게 790개(68%). "고추"는 일부러 키워드에서
// 뺐다 — 색만 내는 고명(두부 달걀전)이나 초절임(양파홍초절임)까지 매콤하게로
// 잘못 걸리는 오탐이 실사용 확인 결과 있어서다. 매콤하게가 상대적으로 적은
// 것도 정확도를 위해 감수한 트레이드오프다. 써보고 너무 부실하면 LLM
// 태깅으로 올리는 걸 다음 단계로 남겨 둔다.

import { mainIngredientNames, type ScorableRecipe } from "@/lib/recipes/matching/score";

/**
 * 재료 이름에 들어있으면 매콤하게로 본다.
 *
 * "고추"는 일부러 뺐다 — 실제 데이터로 확인해보니 매운맛과 무관하게 색을
 * 내는 고명(예: 두부 달걀전)이나 심지어 초절임(양파홍초절임)에도 재료로
 * 들어가 있어, 이 하나만으로는 오탐이 너무 많았다. "고추장"처럼 매운맛이
 * 실제로 음식에 배는 재료만 남긴다.
 */
const SPICY_INGREDIENT_KEYWORDS = ["고추장", "불닭", "땡초"];
/** 레시피 이름에 들어있으면 매콤하게로 본다. */
const SPICY_NAME_KEYWORDS = ["매운", "매콤", "불닭", "마라", "청양"];
/** 이름·재료 어느 쪽에 있어도 담백하게에서 제외한다. */
const RICH_KEYWORDS = ["튀김", "크림", "버터", "마요네즈", "치즈"];

/** FR-09-08: 든든하게 판정 기준 칼로리. 1000개 표본 75%tile(320)보다 조금 위. */
const HEARTY_CALORIE_THRESHOLD = 350;
/** FR-09-08: 간단하게 판정 기준 주재료 개수. */
const SIMPLE_MAIN_INGREDIENT_MAX = 3;

export const MOODS = ["든든하게", "간단하게", "매콤하게", "담백하게"] as const;

export type Mood = (typeof MOODS)[number];

function includesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function isSpicy(recipe: ScorableRecipe, mainNames: readonly string[]): boolean {
  if (includesAny(recipe.name, SPICY_NAME_KEYWORDS)) return true;
  const seasoningNames = recipe.ingredients.map((i) => i.normalizedName);
  return [...mainNames, ...seasoningNames].some((name) =>
    includesAny(name, SPICY_INGREDIENT_KEYWORDS),
  );
}

function isRich(recipe: ScorableRecipe, mainNames: readonly string[]): boolean {
  if (includesAny(recipe.name, RICH_KEYWORDS)) return true;
  const seasoningNames = recipe.ingredients.map((i) => i.normalizedName);
  return [...mainNames, ...seasoningNames].some((name) =>
    includesAny(name, RICH_KEYWORDS),
  );
}

/**
 * 한 레시피가 걸리는 무드 전부. 배타적이지 않다 — 든든하면서 동시에 매콤할
 * 수 있다.
 */
export function resolveMoods(recipe: ScorableRecipe): Mood[] {
  const mainNames = mainIngredientNames(recipe);
  const moods: Mood[] = [];

  const spicy = isSpicy(recipe, mainNames);
  if (spicy) moods.push("매콤하게");
  if (!spicy && !isRich(recipe, mainNames)) moods.push("담백하게");
  if (recipe.calories !== null && recipe.calories >= HEARTY_CALORIE_THRESHOLD) {
    moods.push("든든하게");
  }
  if (mainNames.length > 0 && mainNames.length <= SIMPLE_MAIN_INGREDIENT_MAX) {
    moods.push("간단하게");
  }

  return moods;
}

/** URL로 들어온 무드 값을 걸러서 받는다. FR-09-03의 parseCategories와 같은 패턴. */
export function parseMoods(raw: string | null): string[] {
  if (!raw) return [];
  const known = new Set<string>(MOODS);
  return [...new Set(raw.split(",").map((v) => v.trim()))].filter((v) =>
    known.has(v),
  );
}
