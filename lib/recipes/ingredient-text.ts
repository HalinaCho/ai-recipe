// FR-07-03: 원본 재료 텍스트에서 **계량**과 **재료 그룹**을 뽑아낸다.
//
// 우리는 RCP_PARTS_DTLS를 LLM에 넣어 정규화된 이름과 역할(main/seasoning)만
// 얻고 나머지를 버리고 있었다. 그런데 원문에는 계량이 100% 들어 있고
// ("연두부 75g(3/4모)"), 일부는 그룹까지 나뉘어 있다 ("육수", "고명", "밑간").
// 재료가 이름만 죽 나열되면 뭘 얼마나 사야 하는지 알 수 없다.
//
// **LLM을 다시 돌리지 않고 규칙 기반으로 뽑는 이유**가 중요하다. 재수집으로
// 다시 구조화하면 정규화된 이름이 달라질 수 있는데, 그 이름은 재고 매칭의
// 축이라(FR-07-01) 조용히 바뀌면 매칭이 통째로 어긋난다. 계량은 원문에
// 문자 그대로 적혀 있어 추론이 필요 없으므로, 위험한 쪽을 건드리지 않고
// 안전한 쪽만 파싱한다.
//
// 형식이 제각각이라(아래 참고) 완벽하지 않다 — 실측 96%를 뽑는다. 못 뽑은
// 것은 계량 없이 이름만 보여주면 되고, 원문 전체도 함께 저장해 두므로
// 사용자가 확인할 길이 막히지는 않는다.

/** 줄 맨 앞에 붙는 그룹 라벨. 원문에서 실제로 관찰된 것만 넣는다. */
const GROUP_LABEL =
  /^(주재료|부재료|재료|양념장|양념|소스|드레싱|육수|국물|고명|고기\s*밑간|밑간|초대리|찜\s*양념|무침\s*양념|볶음\s*양념|절임|반죽|토핑|곁들임|샐러드|기타)\s*[:：]?\s*/;

/**
 * 이름 뒤에 바로 붙는 계량. 숫자(분수 기호 포함)로 시작해서 끝까지.
 * 예: "75g", "1/2개", "1½컵", "300ml", "2작은술"
 */
const TRAILING_AMOUNT = /\s+([0-9¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛][^\s].*)$/;

/** 맨 끝의 괄호. 예: "(3/4모)", "(등심, 60g)" */
const TRAILING_PAREN = /^(.*?)\s*\(([^()]*)\)\s*$/;

/**
 * 쉼표로 자르되 **괄호 안은 건드리지 않는다.**
 *
 * "다진 돼지고기(등심, 60g)"를 그냥 쉼표로 자르면 "다진 돼지고기(등심"과
 * "60g)"이라는 쓰레기 두 조각이 나온다. 실제로 이 형태가 원문에 흔하다.
 */
function splitTopLevel(line: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of line) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

export interface ParsedIngredientLine {
  /** 원문 조각 그대로. 파싱이 틀렸을 때 사용자가 확인할 수 있는 근거다. */
  raw: string;
  /** 계량을 떼어낸 재료 표기. 정규화된 이름과는 다를 수 있다. */
  name: string;
  /** 원문 계량 표기. 못 뽑으면 null. 단위 환산은 하지 않는다 (FR-05-04). */
  amount: string | null;
  /** "육수" · "고명" 같은 그룹. 원문에 없으면 null. */
  group: string | null;
}

/**
 * 한 조각("연두부 75g(3/4모)")에서 이름과 계량을 가른다.
 *
 * 괄호와 직접 표기가 **동시에** 오는 경우를 놓치면 안 된다. 괄호만 떼면
 * 이름에 "연두부 75g"이 남아 화면에 재료명이 "연두부 75g"으로 뜬다.
 * 그래서 괄호를 떼고 나서 남은 쪽에서 계량을 한 번 더 뗀다.
 */
export function parseIngredientFragment(
  fragment: string,
): ParsedIngredientLine | null {
  const raw = fragment.trim().replace(/[,·]+$/, "").trim();
  if (!raw) return null;

  let rest = raw;
  let paren: string | null = null;

  const parenMatch = rest.match(TRAILING_PAREN);
  if (parenMatch && parenMatch[1].trim() !== "") {
    rest = parenMatch[1].trim();
    paren = parenMatch[2].trim() || null;
  }

  let measure: string | null = null;
  const amountMatch = rest.match(TRAILING_AMOUNT);
  if (amountMatch) {
    measure = amountMatch[1].trim();
    rest = rest.slice(0, amountMatch.index).trim();
  }

  const amount = [measure, paren].filter(Boolean).join(" ") || null;
  // 계량만 남고 이름이 사라지는 경우(예: 조각이 "300ml"뿐)는 버린다.
  const name = rest.trim();
  if (!name) return null;

  return { raw, name, amount, group: null };
}

/**
 * RCP_PARTS_DTLS 전체를 항목 목록으로 편다.
 *
 * `recipeName`을 넘기면 첫 줄에 요리 이름이 그대로 박혀 있는 경우를 걸러낸다
 * ("새우두부계란찜\n연두부 75g..."). 안 걸러내면 요리 이름이 재료 하나로
 * 목록에 들어간다.
 */
export function parseIngredientText(
  text: string | null | undefined,
  recipeName?: string,
): ParsedIngredientLine[] {
  if (!text) return [];

  const compactName = recipeName?.replace(/\s+/g, "") ?? null;
  const items: ParsedIngredientLine[] = [];
  let group: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;

    if (compactName && line.replace(/\s+/g, "") === compactName) continue;

    const labelMatch = line.match(GROUP_LABEL);
    if (labelMatch) {
      group = labelMatch[1].replace(/\s+/g, " ");
      line = line.slice(labelMatch[0].length).trim();
      if (!line) continue;
    }

    for (const fragment of splitTopLevel(line)) {
      const parsed = parseIngredientFragment(fragment);
      if (parsed) items.push({ ...parsed, group });
    }
  }

  return items;
}

/**
 * 파싱된 원문 항목을 **이미 저장된 정규화 이름**에 붙인다.
 *
 * 정규화 이름(recipe_ingredient.normalized_name)을 새로 만들지 않고 기존 것을
 * 그대로 두는 게 핵심이다 — 그 이름이 재고 매칭의 축이라, 여기서 다시
 * 만들면 매칭이 조용히 어긋난다. 우리는 계량과 그룹만 얹는다.
 *
 * 붙이는 규칙은 "정규화 이름이 원문 표기에 들어 있는가"다. 정규화 이름 자체가
 * 이 원문에서 뽑힌 것이라 대체로 부분 문자열로 잡힌다 ("다진 돼지고기" ⊃ "돼지고기").
 * 여러 개가 걸리면 **가장 짧은 원문**을 고른다 — "돼지고기"에 대해
 * "다진 돼지고기"와 "돼지고기 육수"가 둘 다 걸릴 때 더 정확한 쪽이다.
 */
export function attachAmounts(
  normalizedNames: readonly string[],
  parsed: readonly ParsedIngredientLine[],
): Map<string, { amount: string | null; group: string | null; raw: string }> {
  const result = new Map<
    string,
    { amount: string | null; group: string | null; raw: string }
  >();

  const used = new Set<number>();
  for (const normalized of normalizedNames) {
    // 정규화 이름과 그 동의어를 모두 후보로 삼는다. 짧은 이름부터 보면
    // "돼지고기"가 "다진 돼지고기"에 먼저 붙어 더 정확하다.
    const needles = [normalized, ...(SYNONYMS[normalized] ?? [])].map((value) =>
      value.replace(/\s+/g, ""),
    );

    let bestIndex = -1;
    let bestLength = Infinity;

    for (let i = 0; i < parsed.length; i += 1) {
      if (used.has(i)) continue;
      const candidate = parsed[i].name.replace(/\s+/g, "");
      if (!needles.some((needle) => candidate.includes(needle))) continue;
      if (candidate.length < bestLength) {
        bestLength = candidate.length;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) continue;
    used.add(bestIndex);
    const match = parsed[bestIndex];
    result.set(normalized, {
      amount: match.amount,
      group: match.group,
      raw: match.raw,
    });
  }

  return result;
}

/**
 * 정규화 이름 → 원문에서 쓰일 수 있는 다른 표기.
 *
 * 수집 때 LLM이 표기를 통일해 버려서(쇠고기→소고기, 달걀→계란) 원문과 글자가
 * 달라 못 붙는 경우가 실측 14%였다. 정규화 자체는 손대면 안 되므로(재고 매칭의
 * 축이다) 붙일 때만 동의어를 본다.
 *
 * 실제로 못 붙은 사례에서 뽑은 것만 넣었다 — 짐작으로 넓히면 엉뚱한 재료에
 * 계량이 붙는데, 그건 계량이 없는 것보다 나쁘다.
 */
const SYNONYMS: Record<string, string[]> = {
  계란: ["달걀"],
  소고기: ["쇠고기", "한우", "우둔", "등심", "안심", "양지"],
  돼지고기: ["돈육", "삼겹살", "목살", "등심", "안심", "돼지"],
  닭고기: ["닭", "닭가슴살", "닭 가슴살", "닭다리"],
  후추: ["후춧가루"],
  올리브유: ["올리브오일"],
  식용유: ["카놀라유", "포도씨유"],
  대파: ["파"],
  청양고추: ["청량고추"],
  고춧가루: ["고추가루"],
  참기름: ["참기름"],
  버터: ["무염버터", "가염버터"],
  설탕: ["백설탕", "황설탕"],
  간장: ["저염간장", "진간장", "국간장", "양조간장"],
  된장: ["저염된장"],
  밀가루: ["박력분", "중력분", "강력분"],
  새우: ["칵테일새우", "대하"],
  두부: ["연두부", "순두부", "부침두부"],
};
