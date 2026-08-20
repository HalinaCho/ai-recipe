import { BottomNav } from "@/components/ui/BottomNav";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-24">
      {children}
      <BottomNav />
    </div>
  );
}
