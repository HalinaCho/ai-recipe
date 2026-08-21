import { requireHousehold } from "@/lib/auth/require-household";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireHousehold();
  return <div className="min-h-screen pb-8">{children}</div>;
}
