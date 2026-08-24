"use client";

import Link from "next/link";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { EatSoonSummary } from "@/components/inventory/EatSoonSummary";
import { PreviewBadge } from "@/components/ui/PreviewBadge";
import { SyncPanel } from "@/components/inventory/SyncPanel";
import { TodayRecipesSection } from "@/components/recipes/TodayRecipesSection";
import { useSync } from "@/lib/hooks/use-sync";
import { cn } from "@/lib/utils";

// 홈 탭 — 소진임박 요약(FR-04) + 수동 동기화(FR-02-02)
// + 오늘의 추천 레시피(FR-09-01).
export default function HomePage() {
  const sync = useSync();

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <TopAppBar
        title="냉파고"
        action={
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="메일 동기화"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-lowest text-primary shadow-tinted transition-all active:scale-95 active:translate-y-0.5 disabled:opacity-60"
            >
              <span
                className={cn(
                  "material-symbols-outlined text-2xl",
                  sync.isPending && "animate-spin",
                )}
              >
                sync
              </span>
            </button>
            <Link
              href="/settings"
              aria-label="마이페이지"
              className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-2xl">
                account_circle
              </span>
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-8 px-container-padding pb-4">
        <PreviewBadge />

        <EatSoonSummary />

        <section className="flex flex-col gap-3">
          <h2 className="text-headline-md text-on-surface">메일 동기화</h2>
          <SyncPanel
            isPending={sync.isPending}
            result={sync.data}
            error={sync.error}
            onSync={() => sync.mutate()}
          />
        </section>

        <TodayRecipesSection />
      </div>
    </div>
  );
}
