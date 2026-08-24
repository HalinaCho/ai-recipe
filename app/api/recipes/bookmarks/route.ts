import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { listBookmarkedRecipes } from "@/lib/recipes/matching/queries";
import { createClient } from "@/lib/supabase/server";
import type { RecipeBookmarksResponse } from "@/types/api";

/** GET /api/recipes/bookmarks — 마이페이지의 "레시피 북마크" 목록. */
export async function GET() {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  try {
    const recipes = await listBookmarkedRecipes(supabase, context.householdId);
    const response: RecipeBookmarksResponse = { recipes };
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "북마크를 불러오지 못했습니다",
      },
      { status: 500 },
    );
  }
}
