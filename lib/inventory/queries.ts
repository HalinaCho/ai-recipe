import { elapsedRatio, inferStorageType } from "@/lib/inventory/storage";
import type { ServerSupabaseClient } from "@/lib/inventory/types";
import type { InventoryListItem } from "@/types/api";
import type { Database } from "@/types/database";
import type { InventoryItem, StorageType } from "@/types/domain";

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

/**
 * FR-04-06: 재고를 직접 추가한다.
 *
 * 메일 파싱과 같은 테이블·같은 모양으로 넣는다 — 출처만 다를 뿐
 * 이후 정렬·매칭·소진 처리는 완전히 동일하게 흘러야 한다.
 * `source_mail_connection_id`가 null인 것이 수동 추가라는 유일한 표시다.
 */
export async function createInventoryItem(
  supabase: ServerSupabaseClient,
  householdId: string,
  input: {
    normalizedName: string;
    rawName?: string;
    quantity: string;
    purchasedAt?: string;
    storageType?: StorageType;
  },
): Promise<InventoryItem | null> {
  const normalizedName = input.normalizedName.trim();
  const rawName = input.rawName?.trim() || normalizedName;

  const { data, error } = await supabase
    .from("inventory_item")
    .insert({
      household_id: householdId,
      normalized_name: normalizedName,
      raw_name: rawName,
      quantity: input.quantity.trim() || "1개",
      purchased_at: input.purchasedAt || todayInSeoul(),
      // 사용자가 안 골랐으면 메일 파싱과 같은 규칙으로 추정한다.
      storage_type: input.storageType ?? inferStorageType(rawName, normalizedName),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data ? mapInventoryRow(data) : null;
}

/** FR-04-05: 보관 방식만 고친다 (추정이 틀렸을 때). */
export interface InventoryItemPatch {
  normalizedName?: string;
  rawName?: string;
  quantity?: string;
  purchasedAt?: string;
  storageType?: StorageType;
}

/**
 * FR-04-08: 항목의 고칠 수 있는 값들을 바꾼다 (보관 방식 포함).
 *
 * 재료명을 고칠 수 있어야 하는 이유가 제일 크다. 메일 파싱도 수동 입력도
 * 이름을 틀리게 남길 수 있는데(실제로 "1두부"가 들어간 적이 있다), 이름이
 * 어긋나면 매칭이 **오류 없이 0건**이 된다. 화면에는 "맞는 레시피가 없네"로만
 * 보여서 데이터가 틀렸다는 걸 알아챌 방법이 없다.
 *
 * 주어진 필드만 바꾼다 — 부분 갱신이라 안 보낸 값은 그대로 둔다.
 */
export async function updateInventoryItem(
  supabase: ServerSupabaseClient,
  itemId: string,
  patch: InventoryItemPatch,
): Promise<InventoryItem | null> {
  const update: Database["public"]["Tables"]["inventory_item"]["Update"] = {};
  if (patch.normalizedName !== undefined) {
    update.normalized_name = patch.normalizedName;
    // rawName을 따로 안 주면 표시용 원문도 같이 맞춘다. 안 그러면 목록에는
    // 고치기 전 이름이 그대로 남아 "고쳤는데 그대로네"로 보인다.
    update.raw_name = patch.rawName ?? patch.normalizedName;
  } else if (patch.rawName !== undefined) {
    update.raw_name = patch.rawName;
  }
  if (patch.quantity !== undefined) update.quantity = patch.quantity;
  if (patch.purchasedAt !== undefined) update.purchased_at = patch.purchasedAt;
  if (patch.storageType !== undefined) update.storage_type = patch.storageType;

  if (Object.keys(update).length === 0) return null;

  const { data, error } = await supabase
    .from("inventory_item")
    .update(update)
    .eq("id", itemId)
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
