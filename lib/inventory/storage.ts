import type { StorageType } from "@/types/domain";

// FR-04-02 / FR-04-04: 보관 방식별 소진 우선순위.
//
// 구매일만 보는 순수 FIFO는 "5일 전 산 냉동 계란말이"를 "5일 전 산 상추"와
// 똑같이 급하다고 안내한다. 실사용에서 이 오류가 확인돼(Q1) 보관 방식을
// 반영한다.

/**
 * 보관 방식별 기준일수. **유통기한이 아니라** "이 정도 지나면 슬슬 신경 쓰이는"
 * 감각의 수치다(FR-04-03). 정확한 날짜를 주장하지 않으므로 넉넉하게 잡는다.
 * 실사용 후 조정할 수 있도록 한곳에 모아 둔다.
 */
export const STORAGE_BASELINE_DAYS: Record<StorageType, number> = {
  refrigerated: 7,
  room_temp: 30,
  frozen: 90,
  // 알 수 없으면 실온에 준해 다룬다 — 냉동으로 가정해 방치시키는 것보다
  // 한 번 더 눈에 띄는 쪽이 안전하다.
  unknown: 30,
};

export const STORAGE_LABEL: Record<StorageType, string> = {
  refrigerated: "냉장",
  frozen: "냉동",
  room_temp: "실온",
  unknown: "보관 미정",
};

/**
 * 경과율 = 경과일 ÷ 기준일수. 1에 가까울수록 먼저 먹어야 한다.
 * 보관 방식이 달라도 서로 비교할 수 있는 한 축으로 만드는 게 목적이다.
 */
export function elapsedRatio(
  daysSincePurchase: number,
  storageType: StorageType,
): number {
  const baseline = STORAGE_BASELINE_DAYS[storageType];
  return daysSincePurchase / baseline;
}

// ---------------------------------------------------------------------------
// 상품명에서 보관 방식 추출 (FR-04-04)
// ---------------------------------------------------------------------------

/** 상품명에 표기가 있으면 그대로 쓴다 — 판매자가 붙인 게 가장 정확하다. */
const NAME_PATTERNS: { pattern: RegExp; storage: StorageType }[] = [
  { pattern: /냉동/, storage: "frozen" },
  { pattern: /냉장/, storage: "refrigerated" },
  { pattern: /상온|실온/, storage: "room_temp" },
];

/**
 * 표기가 없을 때 재료명으로 추정한다. 정규화된 이름(맨 재료 명사)을 키로 쓰며,
 * 확신할 수 없으면 unknown으로 남긴다 — 틀린 분류보다 미상이 낫고,
 * 사용자가 화면에서 고칠 수 있다(FR-04-05).
 */
const REFRIGERATED_NAMES = new Set([
  "우유", "계란", "치즈", "요거트", "버터", "생크림",
  "두부", "김치", "어묵", "콩나물", "숙주",
  "상추", "시금치", "부추", "깻잎", "대파", "쪽파", "배추", "브로콜리",
  "오이", "애호박", "가지", "버섯", "파프리카", "피망",
  "소고기", "돼지고기", "닭고기", "베이컨", "햄", "소시지",
  "연어", "고등어", "새우", "오징어", "조개", "생선",
]);

const ROOM_TEMP_NAMES = new Set([
  "양파", "감자", "고구마", "마늘", "생강", "당근",
  "쌀", "밀가루", "국수", "라면", "빵", "떡",
  "설탕", "소금", "간장", "식초", "참기름", "식용유",
  "김", "미역", "다시마", "멸치", "통조림",
]);

const FROZEN_NAMES = new Set(["만두", "아이스크림", "냉동밥"]);

/**
 * 주문 메일에서 뽑은 상품명·재료명으로 보관 방식을 정한다.
 * 상품명 표기 > 재료명 추정 > 미상 순서.
 */
export function inferStorageType(
  rawName: string,
  normalizedName: string,
): StorageType {
  for (const { pattern, storage } of NAME_PATTERNS) {
    if (pattern.test(rawName)) return storage;
  }

  const name = normalizedName.trim();
  if (FROZEN_NAMES.has(name)) return "frozen";
  if (REFRIGERATED_NAMES.has(name)) return "refrigerated";
  if (ROOM_TEMP_NAMES.has(name)) return "room_temp";

  return "unknown";
}
