import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/splash");
  }

  const { data: membership } = await supabase
    .from("member")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  redirect(membership ? "/home" : "/household");
}
