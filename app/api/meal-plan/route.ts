import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import {
  getOrCreateMealPlan,
  regenerateMealPlan,
} from "@/lib/meal-plan/queries";
import {
  currentWeekStart,
  isValidDateString,
  weekStartFor,
} from "@/lib/meal-plan/slots";
import { createClient } from "@/lib/supabase/server";
import type { RegenerateMealPlanRequest } from "@/types/api";

/**
 * 주 시작일을 정한다. 사용자가 주 중간 날짜를 보내도 그 주의 월요일로 맞춘다 —
 * 화면이 어떤 날짜를 보내든 같은 주는 같은 식단표 한 벌이어야 한다
 * (weekly_meal_plan의 unique(household_id, week_start_date)와 같은 축).
 */
function resolveWeekStart(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return currentWeekStart();
  }
  if (!isValidDateString(value)) return null;
  return weekStartFor(value);
}

/**
 * GET /api/meal-plan?weekStart=YYYY-MM-DD — 주간 식단표 (FR-12-01).
 * 그 주의 식단표가 없으면 조회 시점에 자동 생성한다.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requested = new URL(request.url).searchParams.get("weekStart");
  const weekStartDate = resolveWeekStart(requested);

  if (!weekStartDate) {
    return NextResponse.json(
      { error: "weekStart 형식이 올바르지 않습니다 (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  try {
    const response = await getOrCreateMealPlan(
      supabase,
      context.householdId,
      weekStartDate,
    );
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "식단표를 불러오지 못했습니다",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/meal-plan — 한 주 전체 재생성.
 * `includeEdited`가 false(기본)면 사용자가 손댄 칸(swapped·manual)은 보존한다.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | RegenerateMealPlanRequest
    | null;

  if (
    body?.includeEdited !== undefined &&
    typeof body.includeEdited !== "boolean"
  ) {
    return NextResponse.json(
      { error: "includeEdited는 true/false여야 합니다" },
      { status: 400 },
    );
  }

  const weekStartDate = resolveWeekStart(body?.weekStartDate ?? null);
  if (!weekStartDate) {
    return NextResponse.json(
      { error: "weekStartDate 형식이 올바르지 않습니다 (YYYY-MM-DD)" },
      { status: 400 },
    );
  }

  try {
    const response = await regenerateMealPlan(
      supabase,
      context.householdId,
      weekStartDate,
      body?.includeEdited ?? false,
    );
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "식단표를 다시 짜지 못했습니다",
      },
      { status: 500 },
    );
  }
}
