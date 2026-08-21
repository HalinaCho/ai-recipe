import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { createClient } from "@/lib/supabase/server";

/** DELETE /api/shopping-domains/[id] — 가구가 추가한 발신 도메인 삭제. */
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

  const { data, error } = await supabase
    .from("shopping_sender_domain")
    .delete()
    .eq("id", id)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "존재하지 않는 도메인입니다" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
