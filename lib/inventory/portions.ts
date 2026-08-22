// FR-04-09: 재고 한 행이 **몇 끼분**인지.
//
// 지금까지 재고 한 행은 "한 번 쓰면 사라지는 것"이었다. 그런데 레시피는
// 1인분 기준이고 한 끼에 양파 5g·대파 10g씩 쓴다. 양파 한 망을 한 끼에 다
// 썼다고 치면, 재고 아홉 줄이 요리 다섯 개 만에 바닥나고 그 뒤 식단표는
// 통째로 0%가 된다 (실측).
//
// 정확히 하려면 수량을 숫자로 알아야 하는데, 주문 메일의 표기는 "1망"·"1봉"
// 처럼 **개수가 천차만별인 단위**가 많다. 양파 1망이 3개일 수도 8개일 수도
// 있고, 가지 1봉도 3개·4개로 다르다. 우리가 추측할 수 없는 값이라,
// 그런 표기를 만나면 사용자에게 개수를 물어본다.
//
// 물어보기 전까지는 1끼분으로 본다 — 모르는 값을 넉넉히 잡으면 있지도 않은
// 재료로 식단표를 채우게 되고, 그건 장 보러 가서야 알게 되는 종류의 거짓말이다.

/**
 * 개수를 특정할 수 없는 포장 단위.
 *
 * "3개"·"500g"처럼 이미 숫자가 분명한 표기는 여기 없다. 애매한 것만 물어본다 —
 * 다 물어보면 알림이 시끄러워져 정작 중요한 것을 무시하게 된다.
 */
const AMBIGUOUS_UNITS = [
  "망",
  "봉",
  "봉지",
  "팩",
  "단",
  "박스",
  "세트",
  "묶음",
  "포기",
  "손",
  "다발",
];

/**
 * 셀 수 있는 단위. "6개"·"5마리"처럼 숫자가 붙으면 그대로 끼니 수로 본다.
 *
 * 무게·부피(g·ml·L)는 여기 없다. 500g이 몇 끼분인지는 재료마다 다르고
 * 우리가 환산하지 않기로 했다(FR-05-04).
 */
const COUNTABLE_UNITS = [
  "개",
  "알",
  "구",
  "모",
  "쪽",
  "장",
  "마리",
  "포기",
  "송이",
  "줄",
  "덩이",
  "팩",
  "봉",
  "봉지",
  "망",
  "단",
  "박스",
  "묶음",
  "손",
  "다발",
];

/**
 * 수량 표기에서 개수를 읽는다. 못 읽으면 null.
 *
 * 물어보기 전에 읽을 수 있는 건 읽는다 — 재고에 이미 "6개"라고 적혀 있는데
 * 사용자에게 다시 묻는 건 실례이고, 안 물어보면 6개짜리를 1끼분으로 취급해
 * 식단표가 빈다. 실제로 그러고 있었다.
 *
 * "330g, 5개"처럼 여러 표기가 섞이면 **가장 큰 개수**를 쓴다 — 무게와 개수가
 * 같이 적힌 경우 개수 쪽이 "몇 덩이인지"를 말하기 때문이다.
 */
export function parsePortionCount(quantity: string): number | null {
  const text = quantity.trim();
  if (text === "") return null;

  let best: number | null = null;
  for (const unit of COUNTABLE_UNITS) {
    // 단위 앞에 붙은 숫자를 전부 찾는다 (한 표기에 여러 번 나올 수 있다).
    // 템플릿 리터럴 안에서는 \d가 그냥 d로 죽으므로 두 번 escape한다.
    const pattern = new RegExp(`(\\d+)\\s*${unit}(?![가-힣])`, "g");
    for (const match of text.matchAll(pattern)) {
      const count = Number(match[1]);
      if (!Number.isFinite(count) || count < 1 || count > 50) continue;
      if (best === null || count > best) best = count;
    }
  }
  return best;
}

/**
 * 이 수량 표기가 "개수를 물어봐야 하는" 것인가.
 *
 * 애매한 단위가 들어 있고, 그 앞의 숫자가 1이거나 없을 때만 묻는다.
 * "3봉"이라면 3봉이라는 뜻이 분명하니 그대로 3끼분으로 볼 수 있다 —
 * 굳이 물어볼 필요가 없다.
 */
export function needsPortionCount(
  quantity: string,
  portionCount: number | null,
): boolean {
  if (portionCount !== null) return false;

  const text = quantity.trim();
  if (text === "") return false;

  // 표기에서 2 이상을 읽어냈으면 물어볼 게 없다.
  const parsed = parsePortionCount(text);
  if (parsed !== null && parsed > 1) return false;

  return AMBIGUOUS_UNITS.some((unit) => {
    const index = text.indexOf(unit);
    if (index === -1) return false;
    // 단위 앞의 숫자를 본다. 없거나 1이면 개수를 모른다.
    const before = text.slice(0, index).match(/(\d+)\s*$/);
    return before === null || before[1] === "1";
  });
}

/**
 * 이 재고 한 행이 몇 끼분인지.
 *
 * 사용자가 개수를 입력했으면 그 값, 아니면 1이다. 남은 비율(FR-05-03)을
 * 곱해 이미 절반 쓴 것은 절반으로 친다 — 사용자가 이미 관리하는 값이라
 * 공짜로 정확도가 오른다.
 *
 * 올림을 쓰는 이유: ¼ 남은 양파 한 망(6개분)은 1.5끼분인데, 내림하면 1끼분이
 * 되어 있는 재료를 없다고 하게 된다. 남아 있는 것은 최소 한 끼는 쓸 수 있다.
 */
export function portionsOf(item: {
  quantity: string;
  portionCount: number | null;
  remainingFraction: number;
}): number {
  // 사용자가 직접 넣은 값이 가장 정확하고, 없으면 표기에서 읽고,
  // 그것도 안 되면 한 끼분으로 본다.
  const base = item.portionCount ?? parsePortionCount(item.quantity) ?? 1;
  const remaining = Math.max(0, Math.min(1, item.remainingFraction));
  if (remaining === 0) return 0;
  return Math.max(1, Math.ceil(base * remaining));
}
