import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import {
  consumeItem,
  updateInventoryItem,
  type InventoryItemPatch,
} from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";
import type {
  ConsumeInventoryItemRequest,
  ConsumeInventoryItemResponse,
  UpdateInventoryItemRequest,
} from "@/types/api";
import type { StorageType } from "@/types/domain";

const STORAGE_TYPES: StorageType[] = [
  "refrigerated",
  "frozen",
  "room_temp",
  "unknown",
];

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
    | (Partial<ConsumeInventoryItemRequest> &
        Partial<UpdateInventoryItemRequest>)
    | null;

  // FR-04-05·FR-04-08: 수정 요청. 소진 처리와 섞이지 않게 먼저 가른다.
  const patch = buildPatch(body);
  if (patch instanceof Error) {
    return NextResponse.json({ error: patch.message }, { status: 400 });
  }

  if (patch) {
    try {
      const item = await updateInventoryItem(supabase, id, patch);
      if (!item) {
        return NextResponse.json(
          { error: "존재하지 않는 항목입니다" },
          { status: 404 },
        );
      }
      const updated: ConsumeInventoryItemResponse = { item };
      return NextResponse.json(updated);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "항목을 고치지 못했습니다",
        },
        { status: 500 },
      );
    }
  }

  if (!body?.consumedVia || !CONSUMED_VIA_VALUES.includes(body.consumedVia)) {
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

/**
 * 수정 요청이면 패치를, 소진 요청이면 null을, 값이 잘못됐으면 Error를 준다.
 *
 * 이름을 빈 값으로 지우는 걸 막는 게 중요하다. 이름이 비면 매칭에서 영영
 * 빠지는데 화면에는 빈 줄로만 남아, 항목이 왜 추천에 안 잡히는지 알 길이 없다.
 */
function buildPatch(
  body: (Partial<ConsumeInventoryItemRequest> &
    Partial<UpdateInventoryItemRequest>) | null,
): InventoryItemPatch | null | Error {
  if (!body) return null;

  const patch: InventoryItemPatch = {};

  if (body.storageType !== undefined) {
    if (!STORAGE_TYPES.includes(body.storageType)) {
      return new Error("보관 방식이 올바르지 않습니다");
    }
    patch.storageType = body.storageType;
  }

  if (body.normalizedName !== undefined) {
    const name = String(body.normalizedName).trim();
    if (name === "") return new Error("재료 이름은 비울 수 없습니다");
    if (name.length > 60) return new Error("재료 이름이 너무 깁니다");
    patch.normalizedName = name;
  }

  if (body.quantity !== undefined) {
    const quantity = String(body.quantity).trim();
    if (quantity.length > 60) return new Error("수량 표기가 너무 깁니다");
    // 비우면 "1개"로 되돌린다 — 빈 수량은 목록에서 점 하나만 남아 어색하다.
    patch.quantity = quantity || "1개";
  }

  if (body.purchasedAt !== undefined) {
    const date = String(body.purchasedAt).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return new Error("구매일 형식이 올바르지 않습니다 (YYYY-MM-DD)");
    }
    patch.purchasedAt = date;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
