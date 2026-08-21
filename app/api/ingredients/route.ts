import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { IngredientVocabularyResponse } from "@/types/api";

/**
 * GET /api/ingredients — 수동 추가 자동완성에 쓸 재료 어휘 (FR-04-07).
 *
 * 레시피에 실제로 등장하는 이름만 돌려준다. 사용자가 여기서 고르면
 * `inventory_item.normalized_name`과 `recipe_ingredient.normalized_name`이
 * 반드시 맞아떨어져, 표기 차이로 매칭이 조용히 0건이 되는 사고가 없다.
 *
 * 어휘는 레시피 인입(배치) 때만 바뀌므로 오래 캐시해도 안전하다.
 */
export const revalidate = 3600;

/** PostgREST 기본 상한이 1000이라, 전량을 보려면 페이지를 넘겨야 한다. */
const PAGE_SIZE = 1000;

export async function GET() {
  const supabase = await createClient();

  const main = new Set<string>();
  const all = new Set<string>();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("recipe_ingredient")
      .select("normalized_name, role")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.length) break;

    for (const row of data) {
      all.add(row.normalized_name);
      if (row.role === "main") main.add(row.normalized_name);
    }

    if (data.length < PAGE_SIZE) break;
  }

  const response: IngredientVocabularyResponse = {
    main: [...main].sort((a, b) => a.localeCompare(b, "ko")),
    all: [...all].sort((a, b) => a.localeCompare(b, "ko")),
  };

  return NextResponse.json(response);
}
