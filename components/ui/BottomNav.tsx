"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/home", label: "홈", icon: "home" },
  { href: "/inventory", label: "재고", icon: "kitchen" },
  { href: "/recipes", label: "레시피", icon: "restaurant" },
  { href: "/meal-plan", label: "식단표", icon: "calendar_month" },
  { href: "/shopping", label: "장보기", icon: "shopping_cart" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex justify-around rounded-t-xl bg-surface/80 backdrop-blur-xl shadow-tinted px-2 py-2">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-full px-4 py-1.5 min-h-12 text-label-sm transition-all active:scale-95",
              active
                ? "bg-primary-container text-on-primary-container"
                : "text-on-surface-variant opacity-70 hover:opacity-100",
            )}
          >
            <span className="material-symbols-outlined text-[22px] leading-none">
              {tab.icon}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
