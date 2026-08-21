import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { replaceEntryRecipe } from "@/lib/meal-plan/queries";
import { createClient } from "@/lib/supabase/server";
import type { UpdateMealPlanEntryRequest } from "@/types/api";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/meal-plan/entries/[id] — 끼니 교체 (FR-12-02 / FR-12-03).
 *
 * source(swapped인지 manual인지)는 **서버가 정한다.** 재생성 때 무엇을
 * 보존할지가 이 값에 달려 있어서, 사용자가 직접 고른 흔적이 화면 쪽 버그
 * 하나로 날아가면 안 되기 때문이다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "끼니 식별자 형식이 올바르지 않습니다" },
      { status: 400 },
    );
  }

  let body: UpdateMealPlanEntryRequest | null = null;
  try {
    body = (await request.json()) as UpdateMealPlanEntryRequest;
  } catch {
    return NextResponse.json(
      { error: "요청 본문을 읽지 못했습니다" },
      { status: 400 },
    );
  }

  const recipeId = body?.recipeId;
  if (typeof recipeId !== "string" || !UUID_PATTERN.test(recipeId)) {
    return NextResponse.json(
      { error: "recipeId가 필요합니다" },
      { status: 400 },
    );
  }

  try {
    const result = await replaceEntryRecipe(
      supabase,
      context.householdId,
      id,
      recipeId,
    );

    if (result === null) {
      return NextResponse.json(
        { error: "해당 끼니를 찾을 수 없습니다" },
        { status: 404 },
      );
    }

    // 존재하지 않는 레시피는 400이다 — 칸은 멀쩡하고 사용자가 보낸 값이
    // 틀린 경우라, 404로 뭉뚱그리면 화면이 "칸이 사라졌다"로 오해한다.
    if (result === "recipe-not-found") {
      return NextResponse.json(
        { error: "선택한 레시피를 찾을 수 없습니다" },
        { status: 400 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "끼니를 바꾸지 못했습니다",
      },
      { status: 500 },
    );
  }
}
