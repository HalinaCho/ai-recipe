import { BottomNav } from "@/components/ui/BottomNav";
import { requireHousehold } from "@/lib/auth/require-household";

/**
 * 탭 화면은 전부 가구 데이터를 전제로 한다. 페이지마다 검사를 심는 대신
 * 레이아웃 한 곳에서 막는다 — 탭이 늘어날 때 가드를 빠뜨릴 자리가 없다.
 */
export default async function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireHousehold();

  return (
    <div className="min-h-screen pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
