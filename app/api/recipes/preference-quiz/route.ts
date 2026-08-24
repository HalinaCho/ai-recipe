import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import {
  countPreferenceRatings,
  loadPreferenceQuizCandidates,
  submitPreferenceRating,
} from "@/lib/recipes/matching/queries";
import { createClient } from "@/lib/supabase/server";
import type {
  PreferenceQuizResponse,
  RecipePreferenceRating,
  SubmitPreferenceRequest,
} from "@/types/api";

/** 한 번에 보여줄 카드 수. GPT 상담 + 사용자 확정값(20~30개)의 중간. */
const QUIZ_BATCH_SIZE = 24;

const VALID_RATINGS = new Set<RecipePreferenceRating>([
  "like",
  "neutral",
  "dislike",
]);

/** GET /api/recipes/preference-quiz — 마이페이지 "취향 설정" 카드 묶음. */
export async function GET() {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  try {
    const [cards, ratedCount] = await Promise.all([
      loadPreferenceQuizCandidates(supabase, context.householdId, QUIZ_BATCH_SIZE),
      countPreferenceRatings(supabase, context.householdId),
    ]);
    const response: PreferenceQuizResponse = { cards, ratedCount };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "취향 퀴즈를 불러오지 못했습니다",
      },
      { status: 500 },
    );
  }
}

/** POST /api/recipes/preference-quiz — 카드 한 장 평가. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | SubmitPreferenceRequest
    | null;

  if (
    !body ||
    typeof body.recipeId !== "string" ||
    !body.recipeId ||
    !VALID_RATINGS.has(body.rating)
  ) {
    return NextResponse.json(
      { error: "recipeId와 rating(like/neutral/dislike)이 필요합니다" },
      { status: 400 },
    );
  }

  try {
    await submitPreferenceRating(
      supabase,
      context.householdId,
      body.recipeId,
      body.rating,
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "평가를 저장하지 못했습니다",
      },
      { status: 500 },
    );
  }
}
