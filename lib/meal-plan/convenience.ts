// FR-13-10: 간편조리식(밀키트·즉석국) 자리.
//
// 우리 레시피 소스(식약처)에는 "사서 데우기만 하는 것"이 없다. 그런데 실제
// 장보기에서 그게 큰 몫이다 — 곰탕 한 팩을 사두면 바쁜 날 끓이기만 해도
// 한 끼가 되고, 그래서 미리 쟁여 두려고 온라인 장을 본다.
//
// 한 주를 전부 "직접 만드는 요리"로만 채우면 실제 생활과 어긋난다. 매일
// 국을 끓일 사람은 없고, 그렇게 짜인 식단표는 며칠 만에 버려진다. 몇 끼는
// 간편식 자리로 비워 두는 편이 오히려 지켜지는 식단표가 된다.
//
// 목록을 코드에 두는 이유: 이건 레시피가 아니라 **장바구니 후보**다. DB에
// 넣으면 레시피 테이블의 규칙(재료·조리법·영양)을 억지로 맞춰야 하는데,
// 여기에 필요한 건 이름과 검색어뿐이다. 쿠팡·네이버 키가 붙으면
// searchQuery가 그대로 상품 검색어가 된다 (FR-15).

export interface ConvenienceItem {
  /** 안정적인 식별자. meal_plan_entry.convenience_key에 저장된다. */
  key: string;
  name: string;
  /** 커머스 검색에 쓸 문구 (FR-15). 지금은 장보기 목록 표시에만 쓴다. */
  searchQuery: string;
  /** 왜 사두면 좋은지 한 줄. 화면에 그대로 나간다. */
  note: string;
}

/**
 * 국·탕 위주로 골랐다. 직접 끓이려면 몇 시간이 드는데 완제품은 데우기만
 * 하면 되는 것들 — 간편식의 이점이 가장 큰 구간이다. 반찬류는 직접 만드는
 * 게 어렵지 않아 넣지 않았다.
 */
export const CONVENIENCE_CATALOG: readonly ConvenienceItem[] = [
  { key: "gomtang", name: "곰탕", searchQuery: "곰탕 간편식", note: "끓이기만 하면 돼요. 오래 고아야 하는 국이라 사두는 게 이득이에요." },
  { key: "seolleongtang", name: "설렁탕", searchQuery: "설렁탕 밀키트", note: "사골을 오래 우려야 해서 직접 만들기 부담스러워요." },
  { key: "samgyetang", name: "삼계탕", searchQuery: "삼계탕 레토르트", note: "데우기만 하면 되고, 여름에 한 팩 있으면 든든해요." },
  { key: "yukgaejang", name: "육개장", searchQuery: "육개장 간편식", note: "재료가 많이 들어가는 국이라 완제품이 편해요." },
  { key: "galbitang", name: "갈비탕", searchQuery: "갈비탕 밀키트", note: "핏물 빼고 오래 끓여야 해서 사두면 확실히 편해요." },
  { key: "sagol", name: "사골국물", searchQuery: "사골곰국 팩", note: "국물 베이스로 두면 떡국·만둣국까지 금방 만들어요." },
  { key: "budae", name: "부대찌개", searchQuery: "부대찌개 밀키트", note: "재료 가짓수가 많아 밀키트가 오히려 알뜰해요." },
  { key: "gamjatang", name: "감자탕", searchQuery: "감자탕 밀키트", note: "등뼈 손질이 번거로워요. 완제품이 훨씬 간단해요." },
  { key: "sundaeguk", name: "순대국", searchQuery: "순대국밥 간편식", note: "집에서 내기 어려운 국물이라 사두기 좋아요." },
  { key: "chueotang", name: "추어탕", searchQuery: "추어탕 간편식", note: "손질이 까다로워 완제품이 훨씬 낫습니다." },
  { key: "kimchijjigae", name: "김치찌개 밀키트", searchQuery: "김치찌개 밀키트", note: "잘 익은 김치가 없을 때 밀키트가 편해요." },
  { key: "dwaejigukbap", name: "돼지국밥", searchQuery: "돼지국밥 간편식", note: "육수를 오래 내야 하는 종류예요." },
];

const BY_KEY = new Map(CONVENIENCE_CATALOG.map((item) => [item.key, item]));

export function convenienceByKey(key: string | null | undefined) {
  return key ? (BY_KEY.get(key) ?? null) : null;
}

/**
 * 한 주에 넣을 간편식을 고르고, 어느 끼니에 놓을지 정한다.
 *
 * **고르게 흩뿌리는 게 핵심**이다. 몰아 놓으면 이틀 연속 사 먹는 식단이 되어
 * "요리 안 하는 주"처럼 보이고, 붙어 있으면 같은 국을 이틀 연속 먹게 된다.
 *
 * 주차를 섞어 넣어 매주 다른 품목이 나오게 한다 — 같은 곰탕만 계속 뜨면
 * 이미 사둔 사람에게는 쓸모없는 제안이 된다.
 */
export function pickConvenienceSlots(
  slotCount: number,
  perWeek: number,
  weekSeed: number,
): Map<number, ConvenienceItem> {
  const picks = new Map<number, ConvenienceItem>();
  if (slotCount === 0 || perWeek <= 0) return picks;

  const count = Math.min(perWeek, slotCount);
  // 균등 간격의 중앙에 놓는다. 0번째(월요일 첫 끼)에 몰리지 않게 하려는 것 —
  // 주 시작부터 사 먹는 식단표는 인상이 나쁘다.
  const stride = slotCount / count;

  for (let i = 0; i < count; i += 1) {
    const index = Math.min(slotCount - 1, Math.floor(stride * i + stride / 2));
    const item =
      CONVENIENCE_CATALOG[(weekSeed + i) % CONVENIENCE_CATALOG.length];
    // 같은 끼니에 두 번 배정되지 않게 한다 (끼니 수가 적을 때 생길 수 있다).
    if (picks.has(index)) continue;
    picks.set(index, item);
  }

  return picks;
}
