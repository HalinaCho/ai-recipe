import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  CreateHouseholdRequest,
  CreateHouseholdResponse,
} from "@/types/api";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CreateHouseholdRequest;
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data: household, error: householdError } = await supabase
    .from("household")
    .insert({ name: body.name.trim() })
    .select()
    .single();

  if (householdError || !household) {
    return NextResponse.json(
      { error: householdError?.message ?? "failed to create household" },
      { status: 500 },
    );
  }

  const { data: member, error: memberError } = await supabase
    .from("member")
    .insert({
      household_id: household.id,
      user_id: user.id,
      display_name: user.user_metadata?.full_name ?? user.email ?? "구성원",
      role: "owner",
    })
    .select()
    .single();

  if (memberError || !member) {
    return NextResponse.json(
      { error: memberError?.message ?? "failed to create member" },
      { status: 500 },
    );
  }

  const response: CreateHouseholdResponse = {
    household: {
      id: household.id,
      name: household.name,
      createdAt: household.created_at,
    },
    member: {
      id: member.id,
      householdId: member.household_id,
      userId: member.user_id,
      displayName: member.display_name,
      role: member.role,
    },
  };

  return NextResponse.json(response, { status: 201 });
}
