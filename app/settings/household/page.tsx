import { redirect } from "next/navigation";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";

export default async function HouseholdSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/splash");

  const { data: members } = await supabase
    .from("member")
    .select("id, display_name, role, household_id")
    .order("role", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <TopAppBar title="가구 구성원" />
      <div className="px-container-padding flex flex-col gap-3">
        {members?.length ? (
          members.map((m) => (
            <Card key={m.id} className="flex items-center justify-between">
              <span className="text-body-lg text-on-surface">
                {m.display_name}
              </span>
              <span className="text-label-sm text-on-surface-variant">
                {m.role === "owner" ? "관리자" : "구성원"}
              </span>
            </Card>
          ))
        ) : (
          <Card>
            <p className="text-body-md text-on-surface-variant">
              가구 정보를 불러오지 못했어요.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
