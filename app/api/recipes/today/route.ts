import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { todayInSeoul } from "@/lib/inventory/queries";
import { getOrCreateTodayRecipes } from "@/lib/recipes/matching/queries";
import { createClient } from "@/lib/supabase/server";
import type { TodayRecipesResponse } from "@/types/api";

/**
 * GET /api/recipes/today — 오늘의 추천 (FR-09-01).
 * 날짜는 서버 리전이 아니라 한국 시간 기준이다. 재고의 daysSincePurchase와
 * 같은 기준을 써야 "오늘"이 화면마다 달라지지 않는다.
 */
export async function GET() {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const date = todayInSeoul();

  try {
    const recipes = await getOrCreateTodayRecipes(
      supabase,
      context.householdId,
      date,
    );
    const response: TodayRecipesResponse = { date, recipes };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "오늘의 추천을 불러오지 못했습니다",
      },
      { status: 500 },
    );
  }
}
