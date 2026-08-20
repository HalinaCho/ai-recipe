import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { HouseholdMembersResponse } from "@/types/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // RLS (member_select) scopes this to households the caller belongs to.
  const { data, error } = await supabase
    .from("member")
    .select()
    .eq("household_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response: HouseholdMembersResponse = {
    members: (data ?? []).map((m) => ({
      id: m.id,
      householdId: m.household_id,
      userId: m.user_id,
      displayName: m.display_name,
      role: m.role,
    })),
  };

  return NextResponse.json(response);
}
