import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import {
  buildCookChecklist,
  consumeItemsForRecipe,
  logRecipeCooked,
} from "@/lib/recipes/matching/queries";
import { createClient } from "@/lib/supabase/server";
import type {
  CookChecklistResponse,
  CookRecipeRequest,
  CookRecipeResponse,
} from "@/types/api";

/**
 * GET /api/recipes/[id]/cook — 요리함 체크리스트 (FR-05-01).
 * 이 레시피의 주재료 중 재고에 있는 항목만 올린다. 화면은 전부 체크된
 * 상태로 띄우고, 사용자가 예외만 해제한다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const items = await buildCookChecklist(supabase, context.householdId, id);

    if (!items) {
      return NextResponse.json(
        { error: "존재하지 않는 레시피입니다" },
        { status: 404 },
      );
    }

    const response: CookChecklistResponse = { items };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "체크리스트를 불러오지 못했습니다",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/recipes/[id]/cook — "요리함" 처리 (FR-05-01).
 * 체크리스트를 다시 계산하지 않고 받은 id만 소진한다. 무엇을 실제로 썼는지는
 * 사용자만 알기 때문이다. 대신 가구 소유 여부는 서버가 확인한다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as
    | CookRecipeRequest
    | null;

  const ids = body?.consumedInventoryItemIds;
  if (
    !Array.isArray(ids) ||
    ids.some((value) => typeof value !== "string" || value.length === 0)
  ) {
    return NextResponse.json(
      { error: "consumedInventoryItemIds는 문자열 배열이어야 합니다" },
      { status: 400 },
    );
  }

  try {
    const { data: recipe, error } = await supabase
      .from("recipe")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!recipe) {
      return NextResponse.json(
        { error: "존재하지 않는 레시피입니다" },
        { status: 404 },
      );
    }

    const consumedCount = await consumeItemsForRecipe(
      supabase,
      context.householdId,
      ids,
      body?.remainingFractions ?? {},
    );

    // V2 Level 1: 체크를 몇 개 해제했든 "이 레시피로 요리함"을 누른 행동
    // 자체가 취향 신호다 — consumedCount(재고 변화)와는 별개로 항상 남긴다.
    await logRecipeCooked(supabase, context.householdId, id);

    // 체크를 전부 해제하고 눌렀으면 0건이 정상이다. 이미 소진된 항목을
    // 다시 보내도 마찬가지 — 실패가 아니라 "바뀐 게 없음"이다.
    const response: CookRecipeResponse = { consumedCount };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "요리함 처리에 실패했습니다",
      },
      { status: 500 },
    );
  }
}
