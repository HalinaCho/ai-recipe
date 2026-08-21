import { randomUUID } from "crypto";
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
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const body = (await request.json()) as CreateHouseholdRequest;
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // household_select's RLS policy only allows members to read a household,
  // but a user creating their first household isn't a member yet — so
  // chaining .select() on this insert would have the RETURNING clause
  // blocked by that same policy (chicken-and-egg). Generate the id
  // ourselves and insert without RETURNING, then re-fetch both rows in a
  // separate request once the member row (which grants visibility) exists.
  const householdId = randomUUID();

  const { error: householdError } = await supabase
    .from("household")
    .insert({ id: householdId, name: body.name.trim() });

  if (householdError) {
    return NextResponse.json(
      { error: householdError.message },
      { status: 500 },
    );
  }

  const { error: memberError } = await supabase.from("member").insert({
    household_id: householdId,
    user_id: user.id,
    display_name: user.user_metadata?.full_name ?? user.email ?? "구성원",
    role: "owner",
  });

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  const [{ data: household, error: fetchHouseholdError }, { data: member, error: fetchMemberError }] =
    await Promise.all([
      supabase.from("household").select().eq("id", householdId).single(),
      supabase
        .from("member")
        .select()
        .eq("household_id", householdId)
        .eq("user_id", user.id)
        .single(),
    ]);

  if (fetchHouseholdError || !household || fetchMemberError || !member) {
    return NextResponse.json(
      {
        error:
          fetchHouseholdError?.message ??
          fetchMemberError?.message ??
          "failed to load created household",
      },
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
