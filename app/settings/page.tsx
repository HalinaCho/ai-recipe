import Link from "next/link";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { Card } from "@/components/ui/Card";

const ENTRIES = [
  { href: "/settings/preference-quiz", label: "취향 설정" },
  { href: "/settings/bookmarks", label: "레시피 북마크" },
  { href: "/settings/mail-connections", label: "연결된 메일 계정" },
  { href: "/settings/household", label: "가구 구성원" },
  { href: "/settings/shopping-domains", label: "등록 쇼핑몰 발신 도메인" },
] as const;

export default function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar
        title="마이페이지"
        action={
          <Link
            href="/home"
            aria-label="홈으로 돌아가기"
            className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </Link>
        }
      />
      <div className="px-container-padding flex flex-col gap-3">
        {ENTRIES.map((entry) => (
          <Link key={entry.href} href={entry.href}>
            <Card className="flex items-center justify-between active:translate-y-0.5 transition-transform">
              <span className="text-body-lg text-on-surface">
                {entry.label}
              </span>
              <span className="material-symbols-outlined text-on-surface-variant">
                chevron_right
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
