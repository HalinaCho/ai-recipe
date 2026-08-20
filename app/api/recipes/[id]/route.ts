import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { loadRecipeMatch } from "@/lib/recipes/matching/queries";
import { showsMealKitCta } from "@/lib/recipes/matching/score";
import { isWhitelistedSeasoning } from "@/lib/recipes/seasonings";
import { createClient } from "@/lib/supabase/server";
import type { RecipeDetailResponse } from "@/types/api";

/** GET /api/recipes/[id] — 상세. 부족 재료는 매칭 결과 그대로다 (FR-08-02). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const detail = await loadRecipeMatch(supabase, context.householdId, id);

    if (!detail) {
      return NextResponse.json(
        { error: "존재하지 않는 레시피입니다" },
        { status: 404 },
      );
    }

    const { row, ingredientRows, match } = detail;
    const response: RecipeDetailResponse = {
      id: row.id,
      name: row.name,
      imageUrl: row.image_url,
      instructions: row.instructions,
      nutrition: {
        calories: row.calories,
        carbohydrate: row.carbohydrate,
        protein: row.protein,
        fat: row.fat,
        sodium: row.sodium,
      },
      ingredients: ingredientRows.map((ingredient) => ({
        normalizedName: ingredient.normalized_name,
        role: ingredient.role,
        // 수집 시점 플래그가 비어 있어도 화면 표시가 흔들리지 않도록
        // 런타임 화이트리스트로 한 번 더 본다 (FR-07-02).
        isWhitelistedSeasoning:
          ingredient.is_whitelisted_seasoning ||
          isWhitelistedSeasoning(ingredient.normalized_name),
        inStock: detail.context.ownedNames.has(ingredient.normalized_name),
      })),
      match,
      showMealKitCta: showsMealKitCta(match),
    };

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
