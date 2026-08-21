// FR-11-01: 한 주의 끼니 칸을 만든다.
//
// 평일(월~금)은 저녁 1칸, 주말(토·일)과 공휴일은 점심+저녁 2칸. 그래서 한 주의
// 칸 수는 5~14칸 사이에서 그 주의 공휴일 구성에 따라 달라진다.
//
// DB도 외부 API도 모르는 순수 함수만 둔다 — 공휴일 목록은 인자로 받는다.
// 날짜 계산은 테스트로 못 박기 쉬운 대신 눈으로는 틀린 걸 못 잡는 종류라,
// 외부 의존을 걷어내고 값만으로 검증할 수 있게 하는 게 중요하다.

import { todayInSeoul } from "@/lib/inventory/queries";
import { WEEK_START_DAY } from "@/lib/meal-plan/config";
import type { MealType } from "@/types/domain";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 요일 표기. 화면이 아니라 검증 스크립트·로그에서 쓴다. */
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * YYYY-MM-DD를 **UTC 자정**으로 읽는다.
 *
 * `new Date("2026-08-17")`은 UTC로 읽히지만 `new Date(2026, 7, 17)`은 로컬
 * 시간으로 읽혀, 서버 리전에 따라 하루가 밀린다. 날짜만 다루는 값이므로
 * 전 구간을 UTC로 통일하고, "지금이 며칠인가"를 정할 때만 Asia/Seoul을 쓴다
 * (todayInSeoul — 재고의 경과일 계산과 같은 기준이다).
 */
function parseDate(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`날짜 형식이 올바르지 않습니다: ${date}`);
  return ms;
}

function formatDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** YYYY-MM-DD 형식이고 실제로 존재하는 날짜인지. 라우트 입력 검증에서 쓴다. */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  // 2026-02-31 같은 값은 Date.parse가 NaN을 주거나 다른 날짜로 굴러간다.
  return !Number.isNaN(ms) && formatDate(ms) === value;
}

export function addDays(date: string, days: number): string {
  return formatDate(parseDate(date) + days * MS_PER_DAY);
}

/** 0=일 … 6=토. UTC 기준이라 서버 리전에 흔들리지 않는다. */
export function dayOfWeek(date: string): number {
  return new Date(parseDate(date)).getUTCDay();
}

/**
 * 주어진 날짜가 속한 주의 월요일. WEEK_START_DAY가 1(월)이라
 * 일요일은 **지난주**에 속한다 — FR-11-01의 "평일(월~금) + 주말"이
 * 토·일을 한 덩어리로 보기 때문이다.
 */
export function weekStartFor(date: string): string {
  const offset = (dayOfWeek(date) - WEEK_START_DAY + 7) % 7;
  return addDays(date, -offset);
}

/** 이번 주의 시작일 (Asia/Seoul 기준 오늘이 속한 주). */
export function currentWeekStart(now: Date = new Date()): string {
  return weekStartFor(todayInSeoul(now));
}

/** 주의 7일치 날짜. 월요일부터 일요일까지. */
export function weekDates(weekStartDate: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStartDate, index));
}

export function weekEndFor(weekStartDate: string): string {
  return addDays(weekStartDate, 6);
}

/** 배치 전의 빈 칸. 레시피는 generate.ts가 채운다. */
export interface PlannedSlot {
  date: string;
  mealType: MealType;
  isHoliday: boolean;
  holidayName: string | null;
}

function isWeekend(date: string): boolean {
  const day = dayOfWeek(date);
  return day === 0 || day === 6;
}

/**
 * FR-11-01: 한 주의 끼니 칸을 날짜 오름차순, 같은 날은 lunch → dinner 순으로.
 *
 * 순서가 계약인 이유: 배치는 시간순 연쇄 계산이라(FR-13-01) 앞 칸이 쓴 재료가
 * 뒤 칸에서 빠져야 한다. 같은 날 점심을 저녁보다 먼저 두지 않으면 "저녁에 쓴
 * 재료가 그날 점심에 없다"는 뒤집힌 결과가 나온다.
 *
 * `holidays`는 YYYY-MM-DD → 공휴일 이름. 조회에 실패했으면 빈 Map을 넘긴다 —
 * 그래도 주말 판정은 날짜만으로 되므로 식단표는 정상적으로 만들어진다.
 */
export function buildWeekSlots(
  weekStartDate: string,
  holidays: ReadonlyMap<string, string> = new Map(),
): PlannedSlot[] {
  const slots: PlannedSlot[] = [];

  for (const date of weekDates(weekStartDate)) {
    const holidayName = holidays.get(date) ?? null;
    const isHoliday = holidayName !== null;
    // 주말이 아니면서 공휴일이면 점심이 늘어난다. 주말은 공휴일이 아니어도 는다.
    const mealTypes: MealType[] =
      isWeekend(date) || isHoliday ? ["lunch", "dinner"] : ["dinner"];

    for (const mealType of mealTypes) {
      slots.push({ date, mealType, isHoliday, holidayName });
    }
  }

  return slots;
}
