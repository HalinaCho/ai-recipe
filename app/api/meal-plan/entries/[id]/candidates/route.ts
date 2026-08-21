import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { listSwapCandidates } from "@/lib/meal-plan/queries";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/meal-plan/entries/[id]/candidates — 끼니 교체 후보 (FR-12-02).
 *
 * 후보는 그 칸 **시점의 가상 재고**로 점수를 매긴다. 앞 요일이 이미 쓴
 * 재료를 그대로 있다고 치면, 실제로는 못 만드는 레시피가 후보 위쪽에
 * 올라와 사용자가 고른 뒤에야 재료가 없다는 걸 알게 된다.
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
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "끼니 식별자 형식이 올바르지 않습니다" },
      { status: 400 },
    );
  }

  try {
    const response = await listSwapCandidates(
      supabase,
      context.householdId,
      id,
    );

    // 남의 가구 칸과 없는 칸을 같은 404로 묶는다 — 구분해서 알려주면
    // 그 자체가 "그런 칸이 존재한다"는 정보가 된다.
    if (!response) {
      return NextResponse.json(
        { error: "해당 끼니를 찾을 수 없습니다" },
        { status: 404 },
      );
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "교체 후보를 불러오지 못했습니다",
      },
      { status: 500 },
    );
  }
}
