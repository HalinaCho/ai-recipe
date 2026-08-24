import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { DEFAULT_MATCHING_CONFIG } from "@/lib/recipes/matching/config";
import { buildRankedRecipeList } from "@/lib/recipes/matching/queries";
import { parseCategories } from "@/lib/recipes/meal-suitability";
import { createClient } from "@/lib/supabase/server";
import type { RecipeListResponse } from "@/types/api";

function resolveLimit(raw: string | null): number {
  const { default: fallback, max } = DEFAULT_MATCHING_CONFIG.listLimit;
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

/** GET /api/recipes — 온디맨드 레시피 목록, 매칭률 순 (FR-09-02). */
export async function GET(request: Request) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const limit = resolveLimit(params.get("limit"));
  const categories = parseCategories(params.get("categories"));
  const query = params.get("q")?.trim() || undefined;

  try {
    const recipes = await buildRankedRecipeList(
      supabase,
      context.householdId,
      limit,
      undefined,
      categories,
      query,
    );
    const response: RecipeListResponse = { recipes };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "레시피를 불러오지 못했습니다",
      },
      { status: 500 },
    );
  }
}
