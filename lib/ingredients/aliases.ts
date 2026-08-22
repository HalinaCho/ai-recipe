// FR-07-05: 같은 재료의 다른 이름을 하나로 묶는다.
//
// 수집 시점 LLM이 표기를 꽤 통일해 두었다 — 달걀·쇠고기·닭은 각각 계란·
// 소고기·닭고기로 모여 실제 데이터에 0건이다. 남은 것은 **정말로 개념이
// 갈라진** 경우뿐이다.
//
// 쌀(155개 레시피)과 밥(13개)이 그렇다. 재고에 쌀이 있는데 볶음밥이
// "밥이 없어요"로 뜨는 건 사용자 입장에서 말이 안 된다.
//
// **매칭만 묶으면 안 된다**는 게 이 파일의 핵심이다. 재고에는 "쌀"인데
// 레시피가 "밥"을 요구하면, 있다고 판정하고도 가상 재고에서 "밥"을 못 찾아
// 깎지 못한다. 그러면 한 톨의 쌀로 한 주 내내 밥 요리를 배치하게 된다.
// 그래서 재고 쪽과 레시피 쪽 **양쪽 이름을 같은 값으로 정규화**한다.
//
// 목록을 넓히지 않는 이유: 우유/생크림, 식빵/빵처럼 비슷해 보여도 실제로는
// 다른 재료가 많다. 잘못 묶으면 없는 재료를 있다고 하게 되는데, 그건 장 보러
// 가서야 알게 되는 종류의 거짓말이다.

/**
 * 대표 이름 → 같이 묶을 이름들.
 *
 * 대표는 "사러 가서 집는 것"으로 정한다. 밥은 쌀로 짓는 것이므로 쌀이 대표다.
 */
const ALIAS_GROUPS: Record<string, readonly string[]> = {
  쌀: ["밥", "쌀밥", "흰밥", "진밥"],
};

const CANONICAL_BY_ALIAS = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(ALIAS_GROUPS)) {
  for (const alias of aliases) CANONICAL_BY_ALIAS.set(alias, canonical);
}

/**
 * 재료 이름을 대표 이름으로. 묶을 게 없으면 그대로 돌려준다.
 *
 * 재고 이름과 레시피 재료 이름 **양쪽에** 걸어야 한다. 한쪽만 걸면 비교는
 * 맞아도 소진이 어긋난다.
 */
export function canonicalIngredient(name: string): string {
  return CANONICAL_BY_ALIAS.get(name.trim()) ?? name;
}

/**
 * DB 조회용 — 이 이름들과 묶인 이름을 모두 펼친다.
 *
 * `.in("normalized_name", ...)`으로 후보 레시피를 좁힐 때 필요하다. 재고에
 * 쌀만 있는데 "쌀"로만 조회하면 밥을 쓰는 레시피가 후보에서 아예 빠져,
 * 정규화를 해도 만날 일이 없다.
 */
export function expandAliases(names: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const name of names) {
    const trimmed = name.trim();
    out.add(trimmed);
    const canonical = canonicalIngredient(trimmed);
    out.add(canonical);
    for (const alias of ALIAS_GROUPS[canonical] ?? []) out.add(alias);
  }
  return [...out];
}
