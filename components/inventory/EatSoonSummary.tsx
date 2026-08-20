"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { useInventory } from "@/lib/hooks/use-inventory";
import { cn } from "@/lib/utils";
import { EAT_SOON_DAYS, formatPurchasedAgoShort } from "./format";

const MAX_ITEMS = 6;

/**
 * 홈 탭 소진임박 요약 — just the head of the FIFO list (oldest purchases),
 * horizontally scrollable so the row never squeezes the type.
 */
export function EatSoonSummary() {
  const { data, isPending, isError } = useInventory();
  const items = (data?.items ?? []).slice(0, MAX_ITEMS);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <h2 className="text-headline-md text-on-surface">먼저 먹어야 할 재료</h2>
        <Link
          href="/inventory"
          className="flex min-h-12 items-center text-label-md text-primary"
        >
          전체 보기
          <span className="material-symbols-outlined text-base">
            chevron_right
          </span>
        </Link>
      </div>

      {isPending && (
        <div className="flex gap-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-32 w-28 shrink-0 animate-pulse rounded-xl bg-surface-container-lowest shadow-tinted"
            />
          ))}
        </div>
      )}

      {isError && (
        <Card className="p-4">
          <p className="text-body-md text-on-surface-variant">
            재고를 불러오지 못했어요. 아래 동기화를 한 번 눌러보세요.
          </p>
        </Card>
      )}

      {!isPending && !isError && items.length === 0 && (
        <Card className="flex items-center gap-3 p-4">
          <span className="text-3xl" aria-hidden>
            🧺
          </span>
          <p className="text-body-md text-on-surface-variant">
            아직 담긴 재료가 없어요. 메일함을 연결하면 여기에 채워드릴게요.
          </p>
        </Card>
      )}

      {items.length > 0 && (
        <ul className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item) => {
            const eatSoon = item.daysSincePurchase >= EAT_SOON_DAYS;
            return (
              <li key={item.id} className="snap-start">
                <Link
                  href="/inventory"
                  className={cn(
                    "flex h-32 w-28 flex-col items-center justify-center gap-2 rounded-xl p-2 text-center shadow-tinted transition-all active:scale-95 active:translate-y-0.5",
                    eatSoon
                      ? "bg-primary-container"
                      : "bg-surface-container-lowest",
                  )}
                >
                  <IngredientIcon
                    normalizedName={item.normalizedName}
                    size="md"
                    className="bg-surface-container-lowest/70"
                  />
                  <span className="line-clamp-1 w-full text-label-md text-on-surface">
                    {item.normalizedName}
                  </span>
                  <Chip
                    tone="secondary"
                    className={cn(eatSoon && "bg-primary text-on-primary")}
                  >
                    {formatPurchasedAgoShort(item.daysSincePurchase)}
                  </Chip>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
