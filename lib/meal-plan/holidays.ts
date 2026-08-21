// FR-11-02: 공휴일 자동 인식 (한국천문연구원 특일정보 API, 공공데이터포털).
//
// 설계의 축은 **장애 격리**다. 식단표 생성이 공휴일 조회에 의존하는데,
// data.go.kr이 죽었다고 해서 한 주치 식단표가 통째로 실패하면 안 된다.
// 그래서 이 모듈은 절대 던지지 않고, 실패하면 `degraded: true`와 함께
// 있는 만큼(캐시 또는 빈 목록)을 돌려준다. 주말 판정은 날짜만으로 되므로
// 최악의 경우에도 칸 구성의 대부분은 맞는다.

import { createServiceClient } from "@/lib/inventory/service-client";
import type { ServerSupabaseClient } from "@/lib/inventory/types";

const KASI_ENDPOINT =
  "http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

/**
 * 외부 API 대기 상한. 식단표는 사용자가 탭을 여는 동안 만들어지므로,
 * 공휴일 하나 때문에 화면이 몇 초씩 멈추느니 degraded로 넘어가는 게 낫다.
 */
const FETCH_TIMEOUT_MS = 5000;

export interface HolidayLookup {
  /** YYYY-MM-DD → 공휴일 이름 (예: "광복절"). */
  holidays: Map<string, string>;
  /**
   * 외부 조회가 실패해 캐시(또는 빈 목록)로 진행한 경우 true.
   * MealPlanResponse.holidayLookupDegraded로 그대로 나간다.
   */
  degraded: boolean;
}

/** 'YYYY-MM'. fetch 로그의 키이자 API 호출 단위다. */
function yearMonth(date: string): string {
  return date.slice(0, 7);
}

/** 조회 구간이 걸치는 모든 달. 한 주는 최대 두 달에 걸친다. */
function monthsBetween(startDate: string, endDate: string): string[] {
  const months = new Set<string>([yearMonth(startDate), yearMonth(endDate)]);
  return [...months].sort();
}

/** 20260815(number) → "2026-08-15". API가 숫자로 주기도, 문자열로 주기도 한다. */
function toDateString(locdate: unknown): string | null {
  const digits = String(locdate).trim();
  if (!/^\d{8}$/.test(digits)) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

interface KasiItem {
  locdate?: number | string;
  dateName?: string;
  isHoliday?: string;
}

/**
 * 응답에서 항목 배열을 꺼낸다.
 *
 * 이 API는 항목 수에 따라 모양이 세 가지로 갈린다:
 *   0개  → `body.items`가 빈 문자열 `""`
 *   1개  → `body.items.item`이 **객체**
 *   여러 개 → `body.items.item`이 **배열**
 * 배열만 가정하면 공휴일이 하나뿐인 달(삼일절만 있는 3월 같은)에서 조용히
 * 0건이 되므로 셋 다 받는다.
 */
function extractItems(payload: unknown): KasiItem[] {
  const body = (payload as { response?: { body?: unknown } })?.response?.body;
  const items = (body as { items?: unknown })?.items;
  if (!items || typeof items !== "object") return [];

  const item = (items as { item?: unknown }).item;
  if (Array.isArray(item)) return item as KasiItem[];
  if (item && typeof item === "object") return [item as KasiItem];
  return [];
}

function isNormalResponse(payload: unknown): boolean {
  const code = (
    payload as { response?: { header?: { resultCode?: string } } }
  )?.response?.header?.resultCode;
  return code === "00";
}

/**
 * 한 달치를 외부 API에서 받아온다. 실패하면 null (호출부가 degraded로 처리).
 *
 * ⚠️ serviceKey를 **인코딩하지 않고 그대로 붙인다.**
 * data.go.kr이 발급하는 "인코딩 키"는 이미 퍼센트 인코딩된 문자열이라
 * (`...%3D%3D`로 끝난다), URLSearchParams나 encodeURIComponent를 태우면
 * `%`가 `%25`로 이중 인코딩되어 서버가 다른 키로 읽는다. 그러면 HTTP 200에
 * `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 담겨 오는데, 상태 코드가 200이라
 * 원인을 찾기가 매우 어렵다. 그래서 문자열을 직접 조립한다.
 */
async function fetchMonthFromApi(
  yearMonthKey: string,
): Promise<Map<string, string> | null> {
  const serviceKey = process.env.KASI_HOLIDAY_API_KEY;
  if (!serviceKey) return null;

  const [year, month] = yearMonthKey.split("-");
  const url =
    `${KASI_ENDPOINT}?serviceKey=${serviceKey}` +
    `&solYear=${year}&solMonth=${month}&_type=json&numOfRows=100`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // 공휴일은 한 번 정해지면 안 바뀌지만, 캐시는 우리 테이블이 맡는다.
      cache: "no-store",
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    // 키 오류·트래픽 초과도 HTTP 200으로 온다. 헤더의 resultCode를 봐야 한다.
    if (!isNormalResponse(payload)) return null;

    const holidays = new Map<string, string>();
    for (const item of extractItems(payload)) {
      // dateKind에는 공휴일이 아닌 기념일(예: 식목일)도 섞여 온다.
      if (item.isHoliday !== "Y") continue;
      const date = toDateString(item.locdate);
      if (!date) continue;
      holidays.set(date, item.dateName?.trim() || "공휴일");
    }
    return holidays;
  } catch {
    // 타임아웃·네트워크 오류·JSON 파싱 실패 전부 여기로 온다. 던지지 않는다.
    return null;
  }
}

/**
 * 받아온 달을 캐시에 적는다.
 *
 * service role로 쓰는 이유: `public_holiday`는 전역 참조 데이터라 RLS에
 * **읽기 정책만** 있다(0007). 사용자 세션 클라이언트로는 insert가 막힌다.
 * 가구 데이터가 아니므로 service role을 써도 격리(NFR-04)를 해치지 않는다.
 *
 * 캐시 쓰기 실패는 조용히 넘긴다 — 이번 요청은 이미 값을 손에 쥐고 있고,
 * 다음 요청이 API를 한 번 더 부르는 것뿐이다. 식단표를 막을 이유가 없다.
 */
async function writeCache(
  yearMonthKey: string,
  holidays: Map<string, string>,
): Promise<void> {
  try {
    const service = createServiceClient();

    if (holidays.size > 0) {
      await service.from("public_holiday").upsert(
        [...holidays].map(([date, name]) => ({ date, name })),
        { onConflict: "date" },
      );
    }

    // 공휴일이 0개인 달도 반드시 로그를 남긴다. 안 그러면 "받아왔는데 없더라"를
    // "아직 안 받아왔다"로 오해해 그 달을 매 요청마다 다시 부른다.
    await service
      .from("public_holiday_fetch_log")
      .upsert({ year_month: yearMonthKey }, { onConflict: "year_month" });
  } catch {
    // service role 키가 없는 환경(로컬 일부 경로)에서도 조회는 굴러가야 한다.
  }
}

async function readFetchedMonths(
  supabase: ServerSupabaseClient,
  months: string[],
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("public_holiday_fetch_log")
    .select("year_month")
    .in("year_month", months);

  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((row) => row.year_month));
}

async function readCachedHolidays(
  supabase: ServerSupabaseClient,
  startDate: string,
  endDate: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("public_holiday")
    .select("date, name")
    .gte("date", startDate)
    .lte("date", endDate);

  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.date, row.name]));
}

/**
 * 구간에 걸친 공휴일을 돌려준다. 캐시에 없는 달만 외부 API를 부른다.
 *
 * 실패 시 동작(fail-soft):
 *   - API 실패 + 캐시 있음 → 캐시로 진행, degraded: true
 *   - API 실패 + 캐시 없음 → "공휴일 없음"으로 진행, degraded: true
 *   - DB 접근까지 실패      → 빈 목록, degraded: true (여전히 던지지 않는다)
 */
export async function loadHolidays(
  supabase: ServerSupabaseClient,
  startDate: string,
  endDate: string,
): Promise<HolidayLookup> {
  const months = monthsBetween(startDate, endDate);
  let degraded = false;

  let alreadyFetched: Set<string>;
  try {
    alreadyFetched = await readFetchedMonths(supabase, months);
  } catch {
    // 캐시 테이블을 못 읽어도(마이그레이션 미적용 등) 식단표는 나가야 한다.
    return { holidays: new Map(), degraded: true };
  }

  // 이번 요청에서 새로 받은 값. 캐시 쓰기가 실패해도(service role 키 없음 등)
  // 이 요청만큼은 제대로 된 공휴일로 식단표를 만들 수 있게 손에 들고 간다.
  const fetchedNow = new Map<string, string>();

  // 받아온 적 없는 달만 외부로 나간다. 순차로 도는 이유: 한 주는 많아야
  // 두 달이라 병렬화 이득이 없고, 외부 API에 동시 요청을 늘릴 이유도 없다.
  for (const month of months) {
    if (alreadyFetched.has(month)) continue;

    const fetched = await fetchMonthFromApi(month);
    if (!fetched) {
      degraded = true;
      continue;
    }
    for (const [date, name] of fetched) fetchedNow.set(date, name);
    await writeCache(month, fetched);
  }

  const holidays = new Map<string, string>();
  try {
    for (const [date, name] of await readCachedHolidays(
      supabase,
      startDate,
      endDate,
    )) {
      holidays.set(date, name);
    }
  } catch {
    degraded = true;
  }

  // 구간 밖의 날짜(같은 달의 다른 주)는 버린다.
  for (const [date, name] of fetchedNow) {
    if (date >= startDate && date <= endDate) holidays.set(date, name);
  }

  return { holidays, degraded };
}
