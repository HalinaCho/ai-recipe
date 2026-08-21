// 식단표 화면의 표시 규칙. 레시피·재고 쪽 format.ts와 같은 태도로,
// 숫자와 ISO 날짜를 그대로 던지지 않고 사람이 읽는 말로 바꾼다.

import type { MealType } from "@/types/domain";
import { dayOfWeek, parseISODate, weekOffsetFromToday } from "./week";

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "8월 24일 (월)" — 요일까지 붙여야 평일/주말 끼니 수 차이가 납득된다. */
export function formatDayLabel(iso: string): string {
  const date = parseISODate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = WEEKDAY_NAMES[dayOfWeek(iso)];
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${weekday})`;
}

/** "8월 24일" — 주 범위 표시처럼 요일이 필요 없는 자리. */
export function formatShortDate(iso: string): string {
  const date = parseISODate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}

/** "8월 24일 - 8월 30일". */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  return `${formatShortDate(weekStart)} - ${formatShortDate(weekEnd)}`;
}

/**
 * "이번 주" / "다음 주" / "3주 전". 날짜 범위만 있으면 지금 어디를 보고 있는지
 * 한눈에 안 들어와서, 범위 옆에 한 마디를 같이 둔다.
 */
export function formatWeekOffsetLabel(weekStart: string, today: string): string {
  const offset = weekOffsetFromToday(weekStart, today);
  if (offset === 0) return "이번 주";
  if (offset === 1) return "다음 주";
  if (offset === -1) return "지난 주";
  return offset > 0 ? `${offset}주 뒤` : `${-offset}주 전`;
}

export function formatMealType(mealType: MealType): string {
  return mealType === "lunch" ? "점심" : "저녁";
}

/** 배치 점수(0~1) → "78%". FR-13-04의 점수는 매칭률과 다르므로 라벨도 다르게 쓴다. */
export function formatMatchScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * 매칭률이 아주 낮은 칸에 붙일 한 줄 (FR-13-03).
 * 엔진이 빈 칸을 만들지 않기 때문에 10~20%짜리 끼니가 실제로 올라온다.
 * 그냥 두면 "추천이 이상하다"로 읽히므로, 왜 이게 여기 있는지 말해준다.
 */
export function formatLowMatchNote(matchRate: number): string | null {
  if (matchRate >= 0.4) return null;
  if (matchRate <= 0) return "지금 있는 재료로는 안 되는 메뉴예요. 장을 봐야 만들 수 있어요.";
  return "재료가 많이 부족하지만, 이번 주에 해볼 만해서 넣어뒀어요.";
}

/** "10끼 중 7끼 기준이에요" — FR-14-01. 합계만 보여주면 오해가 생긴다. */
export function formatNutritionCoverage(
  coveredSlots: number,
  totalSlots: number,
): string {
  if (totalSlots === 0) return "아직 계산할 끼니가 없어요";
  if (coveredSlots === 0) return "영양정보가 있는 끼니가 아직 없어요";
  if (coveredSlots === totalSlots) return `이번 주 ${totalSlots}끼 전부 기준이에요`;
  return `${totalSlots}끼 중 ${coveredSlots}끼 기준이에요`;
}

/** 큰 수는 자릿점을 찍어준다 — "12345kcal"는 안 읽힌다. */
export function formatNutritionValue(value: number, unit: string): string {
  return `${Math.round(value).toLocaleString("ko-KR")}${unit}`;
}
