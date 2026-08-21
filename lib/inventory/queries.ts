import { elapsedRatio } from "@/lib/inventory/storage";
import type { ServerSupabaseClient } from "@/lib/inventory/types";
import type { InventoryListItem } from "@/types/api";
import type { Database } from "@/types/database";
import type { InventoryItem } from "@/types/domain";

type InventoryRow = Database["public"]["Tables"]["inventory_item"]["Row"];

export function mapInventoryRow(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    householdId: row.household_id,
    normalizedName: row.normalized_name,
    rawName: row.raw_name,
    quantity: row.quantity,
    purchasedAt: row.purchased_at,
    storageType: row.storage_type,
    remainingFraction: Number(row.remaining_fraction),
    sourceMailConnectionId: row.source_mail_connection_id,
    status: row.status,
    consumedAt: row.consumed_at,
    consumedVia: row.consumed_via,
  };
}

/**
 * 오늘 날짜를 한국 시간 기준 YYYY-MM-DD로. purchased_at이 시각 없는 date라
 * 서버가 어느 리전에 뜨든 "며칠 지났는지"가 같아야 한다.
 */
export function todayInSeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysSincePurchase(
  purchasedAt: string,
  today: string = todayInSeoul(),
): number {
  const from = Date.parse(`${purchasedAt}T00:00:00Z`);
  const to = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / MS_PER_DAY));
}

/**
 * FR-04-02: 보관 방식별 경과율(경과일 ÷ 기준일수)이 높은 순.
 *
 * 정렬을 DB가 아니라 여기서 하는 이유: 기준일수는 실사용을 보며 조정할
 * 값이라 코드에 두고(lib/inventory/storage.ts), SQL로 흩뿌리지 않는다.
 * 가구 하나의 재고는 많아야 수백 건이라 메모리 정렬로 충분하다.
 */
export async function listInStockItems(
  supabase: ServerSupabaseClient,
  householdId: string,
): Promise<InventoryListItem[]> {
  const { data, error } = await supabase
    .from("inventory_item")
    .select()
    .eq("household_id", householdId)
    .eq("status", "in_stock")
    .order("purchased_at", { ascending: true })
    // 같은 날 산 항목끼리는 들어온 순서로 고정해 목록이 흔들리지 않게 한다.
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const today = todayInSeoul();
  return (data ?? [])
    .map((row) => {
      const item = mapInventoryRow(row);
      const days = daysSincePurchase(row.purchased_at, today);
      return {
        ...item,
        daysSincePurchase: days,
        elapsedRatio: elapsedRatio(days, item.storageType),
      };
    })
    .sort((a, b) => {
      if (b.elapsedRatio !== a.elapsedRatio) {
        return b.elapsedRatio - a.elapsedRatio;
      }
      // 경과율이 같으면 원래 구매일 순 — 목록이 요청마다 흔들리지 않도록.
      return a.purchasedAt.localeCompare(b.purchasedAt) || a.id.localeCompare(b.id);
    });
}

/**
 * FR-05-03: 분수 단위 소진. `remainingFraction`은 **소진 후 남길 비율**이다
 * (0 = 다 씀, 0.5 = 반 남김). 단위 환산은 하지 않는다(FR-05-04).
 *
 * 0이 되는 순간에만 status가 consumed로 넘어간다 — 조금이라도 남았으면
 * 재고에 그대로 있어야 레시피 매칭에 계속 잡힌다.
 */
export async function consumeItem(
  supabase: ServerSupabaseClient,
  itemId: string,
  consumedVia: "manual" | "recipe_cooked",
  remainingFraction = 0,
): Promise<InventoryItem | null> {
  const remaining = clampFraction(remainingFraction);
  const isEmpty = remaining === 0;

  const { data, error } = await supabase
    .from("inventory_item")
    .update({
      remaining_fraction: remaining,
      status: isEmpty ? "consumed" : "in_stock",
      consumed_at: isEmpty ? new Date().toISOString() : null,
      consumed_via: isEmpty ? consumedVia : null,
    })
    .eq("id", itemId)
    .eq("status", "in_stock")
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapInventoryRow(data) : null;
}

/** 0~1 밖의 값은 받지 않는다. 소수점은 표시 흔들림을 막으려 두 자리로 자른다. */
function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}
