import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import {
  createInventoryItem,
  listInStockItems,
} from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";
import type {
  CreateInventoryItemRequest,
  CreateInventoryItemResponse,
  InventoryListResponse,
} from "@/types/api";

/** GET /api/inventory — 재고 탭. 보관방식별 경과율 순(FR-04-02). */
export async function GET() {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
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

/**
 * POST /api/inventory — 재고 직접 추가 (FR-04-06).
 *
 * 메일 파싱이 못 잡는 마트·시장 구매를 메우는 경로다. 들어간 뒤로는
 * 메일에서 온 항목과 완전히 동일하게 다뤄진다.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | CreateInventoryItemRequest
    | null;

  const normalizedName = body?.normalizedName?.trim() ?? "";
  if (!normalizedName) {
    return NextResponse.json(
      { error: "재료 이름을 입력해 주세요" },
      { status: 400 },
    );
  }

  if (body?.purchasedAt && !/^\d{4}-\d{2}-\d{2}$/.test(body.purchasedAt)) {
    return NextResponse.json(
      { error: "구매일 형식이 올바르지 않습니다" },
      { status: 400 },
    );
  }

  try {
    const item = await createInventoryItem(supabase, context.householdId, {
      normalizedName,
      rawName: body?.rawName,
      quantity: body?.quantity ?? "",
      purchasedAt: body?.purchasedAt,
      storageType: body?.storageType,
    });

    if (!item) {
      return NextResponse.json(
        { error: "재고를 추가하지 못했습니다" },
        { status: 500 },
      );
    }

    const response: CreateInventoryItemResponse = { item };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "재고를 추가하지 못했습니다",
      },
      { status: 500 },
    );
  }
}
