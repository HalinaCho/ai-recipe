import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { getOrCreateMealPlan } from "@/lib/meal-plan/queries";
import { buildShoppingList } from "@/lib/meal-plan/shopping-list";
import {
  currentWeekStart,
  isValidDateString,
  weekStartFor,
} from "@/lib/meal-plan/slots";
import { createClient } from "@/lib/supabase/server";
import type { ShoppingListResponse } from "@/types/api";

/**
 * GET /api/shopping-list?weekStart=YYYY-MM-DD — FR-17-02.
 *
 * 식단표를 다시 계산하지 않고 그대로 읽어 쓴다. 장보기 목록이 식단표와
 * 다른 근거로 만들어지면, 화면 두 개가 서로 다른 "부족 재료"를 말하게 된다.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json(
      { error: "로그인이 풀렸어요. 다시 로그인해주세요." },
      { status: 401 },
    );
  }

  const requested = new URL(request.url).searchParams.get("weekStart");
  const weekStartDate =
    requested === null || requested === ""
      ? currentWeekStart()
      : isValidDateString(requested)
        ? weekStartFor(requested)
        : null;

  if (!weekStartDate) {
    return NextResponse.json(
      { error: "weekStart 형식이 올바르지 않습니다 (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  try {
    const plan = await getOrCreateMealPlan(
      supabase,
      context.householdId,
      weekStartDate,
    );

    const response: ShoppingListResponse = {
      weekStartDate: plan.weekStartDate,
      weekEndDate: plan.weekEndDate,
      items: buildShoppingList(plan.slots),
      totalSlots: plan.slots.length,
      slotsNeedingShopping: plan.slots.filter((slot) =>
        slot.dishes.some((dish) => dish.missingMainIngredients.length > 0),
      ).length,
    };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "장보기 목록을 만들지 못했습니다",
      },
      { status: 500 },
    );
  }
}
