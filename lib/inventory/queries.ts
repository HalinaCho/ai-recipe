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
 * FR-04-02: 재고는 순수 FIFO — 구매일이 오래된 순. 신선도 가중치도,
 * 유통기한도 없다(FR-04-03).
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
  return (data ?? []).map((row) => ({
    ...mapInventoryRow(row),
    daysSincePurchase: daysSincePurchase(row.purchased_at, today),
  }));
}

/**
 * FR-05-02: 소진 처리. 수량 차감이나 단위 환산은 없다 — 재고는 있거나
 * 없거나 둘 중 하나다(FR-05-03).
 */
export async function consumeItem(
  supabase: ServerSupabaseClient,
  itemId: string,
  consumedVia: "manual" | "recipe_cooked",
): Promise<InventoryItem | null> {
  const { data, error } = await supabase
    .from("inventory_item")
    .update({
      status: "consumed",
      consumed_at: new Date().toISOString(),
      consumed_via: consumedVia,
    })
    .eq("id", itemId)
    .eq("status", "in_stock")
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapInventoryRow(data) : null;
}
