import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { createClient } from "@/lib/supabase/server";
import type { RecipeBookmarkResponse } from "@/types/api";

/** POST /api/recipes/[id]/bookmark — 레시피 담기. 가구가 공유하는 목록이다. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const { id } = await params;

  const { data: recipe, error: recipeError } = await supabase
    .from("recipe")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (recipeError) {
    return NextResponse.json({ error: recipeError.message }, { status: 500 });
  }
  if (!recipe) {
    return NextResponse.json(
      { error: "존재하지 않는 레시피입니다" },
      { status: 404 },
    );
  }

  // 이미 담아둔 걸 다시 눌러도(중복 탭) 유니크 제약이 조용히 막아준다 —
  // 실패로 보이지 않게 그 경우도 성공으로 취급한다.
  const { error } = await supabase.from("recipe_bookmark").upsert(
    { household_id: context.householdId, recipe_id: id },
    { onConflict: "household_id,recipe_id", ignoreDuplicates: true },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response: RecipeBookmarkResponse = { bookmarked: true };
  return NextResponse.json(response, { status: 201 });
}

/** DELETE /api/recipes/[id]/bookmark — 레시피 빼기. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await supabase
    .from("recipe_bookmark")
    .delete()
    .eq("household_id", context.householdId)
    .eq("recipe_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response: RecipeBookmarkResponse = { bookmarked: false };
  return NextResponse.json(response);
}
