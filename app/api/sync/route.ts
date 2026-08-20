import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { runHouseholdSync } from "@/lib/inventory/sync";
import { createClient } from "@/lib/supabase/server";

// 메일 개수 × LLM 호출이라 기본 함수 타임아웃으로는 모자란다.
export const maxDuration = 300;

/** POST /api/sync — 홈 탭의 [동기화] 버튼(FR-02-02). */
export async function POST() {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runHouseholdSync(supabase, context.householdId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "동기화에 실패했습니다",
      },
      { status: 500 },
    );
  }
}
