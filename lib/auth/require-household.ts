import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * 로그인·가구 소속을 서버에서 먼저 확인하고, 아니면 알맞은 곳으로 보낸다.
 *
 * 원래는 루트(`/`)에만 이 검사가 있어서, `/inventory` 같은 탭 주소를 직접
 * 열거나 새로고침하면 껍데기만 그려진 뒤 클라이언트가 401을 받아 깨졌다.
 * 사용자 눈에는 "로그인이 튕기고 재고가 비어 보이는" 화면으로만 보인다.
 *
 * **로그인 안 됨과 가구 없음을 갈라서** 보내는 게 중요하다. 둘 다 로그인으로
 * 보내면, 가구에 속하지 않은 계정으로 들어온 사람은 로그인에 성공했는데도
 * 계속 로그인 화면으로 되돌아와 이유를 알 수 없다. (실제로 이 프로젝트에는
 * 가입 계정이 셋인데 가구 구성원은 하나뿐이다.)
 */
export async function requireHousehold(): Promise<{
  userId: string;
  householdId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/splash");

  const { data: membership } = await supabase
    .from("member")
    .select("household_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/household");

  return { userId: user.id, householdId: membership.household_id };
}
