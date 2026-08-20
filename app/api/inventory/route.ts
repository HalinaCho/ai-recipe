import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { listInStockItems } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";
import type { InventoryListResponse } from "@/types/api";

/** GET /api/inventory — 재고 탭. 구매일 오래된 순(FR-04-02). */
export async function GET() {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const items = await listInStockItems(supabase, context.householdId);
    const response: InventoryListResponse = { items };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "재고를 불러오지 못했습니다" },
      { status: 500 },
    );
  }
}
