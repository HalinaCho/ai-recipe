import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { consumeItem } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";
import type {
  ConsumeInventoryItemRequest,
  ConsumeInventoryItemResponse,
} from "@/types/api";

const CONSUMED_VIA_VALUES: ConsumeInventoryItemRequest["consumedVia"][] = [
  "manual",
  "recipe_cooked",
];

/**
 * PATCH /api/inventory/[id] — 항목 하나를 소진 처리(FR-05-02).
 * 수량 차감은 없다. 재고는 있거나 없거나다(FR-05-03).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | ConsumeInventoryItemRequest
    | null;

  if (!body || !CONSUMED_VIA_VALUES.includes(body.consumedVia)) {
    return NextResponse.json(
      { error: "consumedVia는 manual 또는 recipe_cooked여야 합니다" },
      { status: 400 },
    );
  }

  try {
    const item = await consumeItem(
      supabase,
      id,
      body.consumedVia,
      body.remainingFraction ?? 0,
    );

    if (!item) {
      // RLS가 다른 가구 항목을 가려주므로, 없는 항목과 이미 소진된 항목이
      // 여기서는 똑같이 보인다.
      return NextResponse.json(
        { error: "이미 소진되었거나 존재하지 않는 항목입니다" },
        { status: 404 },
      );
    }

    const response: ConsumeInventoryItemResponse = { item };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "소진 처리에 실패했습니다",
      },
      { status: 500 },
    );
  }
}
