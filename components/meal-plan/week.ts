// 식단표 화면이 쓰는 주(週) 계산. 순수 함수만 두고 React를 섞지 않는다.
//
// 배치 엔진이 쓰는 `lib/meal-plan/`은 다른 트랙 소유라 여기에 손대지 않는다.
// 대신 "주는 월요일에 시작한다"는 유일한 사실만 config에서 읽어 와서(WEEK_START_DAY),
// 화면과 엔진이 같은 경계를 쓰도록 맞춘다.
//
// 날짜 계산은 전부 UTC 기준으로 한다. 로컬 시간대로 더하고 빼면 서머타임·시차
// 때문에 "하루"가 23시간이 되는 경우가 생겨 주 경계가 밀린다. 반대로 "오늘이
// 며칠인가"는 반드시 한국 시간이어야 해서(자정 직후 접속) 거기만 Asia/Seoul을 쓴다.

import { WEEK_START_DAY } from "@/lib/meal-plan/config";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const SEOUL_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 오늘 날짜(YYYY-MM-DD)를 한국 시간 기준으로. */
export function seoulToday(): string {
  const parts = SEOUL_PARTS.formatToParts(new Date());
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

export function isISODate(value: string): boolean {
  return ISO_DATE.test(value);
}

/** YYYY-MM-DD → UTC 자정 Date. 형식이 아니면 Invalid Date. */
export function parseISODate(iso: string): Date {
  const matched = ISO_DATE.exec(iso);
  if (!matched) return new Date(NaN);
  return new Date(
    Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])),
  );
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

/** 0=일 … 6=토. */
export function dayOfWeek(iso: string): number {
  return parseISODate(iso).getUTCDay();
}

/** 그 날짜가 속한 주의 시작일(월요일). */
export function weekStartOf(iso: string): string {
  const offset = (dayOfWeek(iso) - WEEK_START_DAY + 7) % 7;
  return addDays(iso, -offset);
}

export function weekEndOf(weekStart: string): string {
  return addDays(weekStart, 6);
}

/** 이번 주 기준 몇 주 떨어져 있는지. -1=지난 주, 0=이번 주, 1=다음 주. */
export function weekOffsetFromToday(weekStart: string, today: string): number {
  const diffMs =
    parseISODate(weekStart).getTime() - parseISODate(weekStartOf(today)).getTime();
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
}

/** 1970-01-05(월)부터 센 주 번호. 픽스처가 주마다 다른 식단을 만들 때 쓴다. */
export function weekIndexOf(weekStart: string): number {
  const EPOCH_MONDAY = Date.UTC(1970, 0, 5);
  const diffMs = parseISODate(weekStart).getTime() - EPOCH_MONDAY;
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}

export function isWeekend(iso: string): boolean {
  const day = dayOfWeek(iso);
  return day === 0 || day === 6;
}

/** 주의 7일을 월→일 순서로. */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}
