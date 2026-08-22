// FR-04-07: 재료 자동완성 제안 순서.
//
// 화면(IngredientCombobox)에서 분리해 둔 이유는 이 규칙이 한 번 사용자를
// 헷갈리게 한 적이 있어서다. "쌀"을 치면 쌀가루·좁쌀·찹쌀만 뜨고 정작 "쌀"이
// 없어서, 목록에 쌀이 없는 줄 알았다는 보고가 있었다. 눈으로는 잡기 어렵고
// 값으로는 바로 드러나는 종류라 테스트가 붙을 수 있는 자리에 둔다.

export const MAX_SUGGESTIONS = 8;

/**
 * 제안 순서: 정확 일치 → 앞에서부터 일치 → 포함.
 *
 * 정확 일치를 **빼지 않고 맨 앞에** 두는 게 핵심이다. "이미 다 쳤으니 다시
 * 보여줄 필요 없다"가 아니라, 정답이 목록에 없으면 사용자는 "이 재료는
 * 지원하지 않는구나"로 읽는다.
 *
 * 앞에서부터 일치를 포함보다 위에 두는 이유: "파"를 치면 "파프리카"가
 * "대파"보다 위에 오는 게 자연스럽다.
 */
export function suggestIngredients(
  query: string,
  options: readonly string[],
  limit = MAX_SUGGESTIONS,
): string[] {
  const trimmed = query.trim();
  if (trimmed === "") return [];

  const exact = options.includes(trimmed) ? [trimmed] : [];
  const starts: string[] = [];
  const contains: string[] = [];

  for (const option of options) {
    if (option === trimmed) continue;
    if (option.startsWith(trimmed)) starts.push(option);
    else if (option.includes(trimmed)) contains.push(option);
    if (starts.length >= limit) break;
  }

  return [...exact, ...starts, ...contains].slice(0, limit);
}
