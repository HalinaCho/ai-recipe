import type { ServerSupabaseClient } from "@/lib/inventory/types";
import { DEFAULT_SENDER_DOMAINS } from "@/lib/mail-adapters/sender-domains";

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/^@/, "");
}

// 사용자가 "coupang.com"을 넣었는지 "쿠팡"을 넣었는지 정도는 걸러야 IMAP
// SEARCH FROM이 헛돌지 않는다.
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function isValidDomain(input: string): boolean {
  return DOMAIN_PATTERN.test(input);
}

/**
 * 실제 필터에 쓰이는 발신 도메인 = 기본 목록 ∪ 가구가 등록한 목록.
 * FR-01-05(Gmail 보조 필터) / FR-01-06(네이버 IMAP 주 필터) 양쪽이 이걸 쓴다.
 */
export async function getEffectiveSenderDomains(
  supabase: ServerSupabaseClient,
  householdId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("shopping_sender_domain")
    .select("domain")
    .eq("household_id", householdId);

  if (error) throw new Error(error.message);

  const merged = new Set<string>(DEFAULT_SENDER_DOMAINS);
  for (const row of data ?? []) merged.add(normalizeDomain(row.domain));
  return [...merged];
}
