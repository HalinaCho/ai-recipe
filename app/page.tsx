import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/auth/require-household";

export default async function RootPage() {
  // 로그인·가구가 없으면 requireHousehold가 알맞은 곳으로 보낸다.
  await requireHousehold();
  redirect("/home");
}
