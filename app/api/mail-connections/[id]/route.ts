import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/mail-connections/[id] — 메일 계정 연결 해제.
 *
 * 행을 지우지 않고 status를 revoked로 내린다. inventory_item이
 * source_mail_connection_id로 이 행을 참조하고 있어서, 삭제하면 이미 쌓인
 * 재고의 출처가 함께 날아간다. 목록(GET)에서는 revoked를 감추므로
 * 사용자에겐 사라진 것으로 보인다.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from("mail_connection")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("household_id", context.householdId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "존재하지 않는 메일 연결입니다" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
