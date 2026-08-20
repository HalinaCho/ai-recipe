import type { ServerSupabaseClient } from "@/lib/inventory/types";

export interface HouseholdContext {
  userId: string;
  memberId: string;
  householdId: string;
}

/**
 * 로그인한 사용자의 가구를 찾는다. RLS가 가구 격리를 강제하지만(NFR-04),
 * 라우트는 어떤 household_id로 insert할지 알아야 하므로 member 행을 한 번 읽는다.
 *
 * 한 사용자가 여러 가구에 속하는 경우는 v1 범위 밖이라 가장 먼저 만든 가구를 쓴다.
 */
export async function getHouseholdContext(
  supabase: ServerSupabaseClient,
): Promise<HouseholdContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: member } = await supabase
    .from("member")
    .select("id, household_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!member) return null;

  return {
    userId: user.id,
    memberId: member.id,
    householdId: member.household_id,
  };
}
