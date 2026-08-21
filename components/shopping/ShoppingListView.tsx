"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { useShoppingList } from "@/lib/hooks/use-shopping-list";
import type { ShoppingListEntry } from "@/types/api";

/**
 * FR-17-02·FR-17-03: 한 주치 부족 재료를 재료 기준으로 모아 보여준다.
 *
 * 쿠팡·네이버 링크(FR-15)는 아직 붙지 않았다. 자리를 비워 두는 대신 "무엇을
 * 사야 하는지"만이라도 제대로 보여주는 게 낫다 — 목록 자체가 장을 볼 때
 * 쓸모 있고, 링크는 나중에 이 줄 위에 얹으면 된다.
 */
export function ShoppingListView() {
  const { data, isPending, isError, error, refetch } = useShoppingList();

  return (
    <div className="flex flex-col gap-4">
      {isPending && <ShoppingListSkeleton />}

      {isError && (
        <Card className="flex flex-col gap-3 border-2 border-error-container p-4">
          <p className="text-body-md text-on-error-container">
            {error instanceof Error ? error.message : "알 수 없는 오류예요."}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-12 rounded-xl bg-primary text-label-md text-on-primary"
          >
            다시 시도
          </button>
        </Card>
      )}

      {data && data.items.length === 0 && (
        <Card className="flex flex-col gap-2 p-4">
          <p className="text-body-lg text-on-surface">
            이번 주는 살 게 없어요 🎉
          </p>
          <p className="text-body-md text-on-surface-variant">
            식단표의 {data.totalSlots}끼가 모두 있는 재료로 만들 수 있어요.
          </p>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          <p className="px-1 text-label-md text-on-surface-variant">
            {data.totalSlots}끼 중 {data.slotsNeedingShopping}끼가 재료가
            부족해요. 여러 끼니에 쓰이는 재료를 위에 뒀어요.
          </p>

          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <li key={item.normalizedName}>
                <ShoppingRow item={item} />
              </li>
            ))}
          </ul>

          <p className="px-1 pt-1 text-label-md text-on-surface-variant">
            모두 {data.items.length}가지를 사면 이번 주 식단이 채워져요.
          </p>

          {/* FR-15: 쿠팡·네이버 연결은 자격증명이 준비되면 이 아래에 붙는다. */}
          <Card className="flex flex-col gap-1 bg-surface-container-low p-4 shadow-none">
            <p className="text-label-md text-on-surface-variant">
              쿠팡·네이버쇼핑 연결은 준비 중이에요
            </p>
            <p className="text-label-sm text-on-surface-variant">
              지금은 목록만 보여드려요. 링크가 붙으면 여기서 바로 넘어갈 수
              있어요.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

const MEAL_LABEL = { lunch: "점심", dinner: "저녁" } as const;

function ShoppingRow({ item }: { item: ShoppingListEntry }) {
  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-3">
        <IngredientIcon
          normalizedName={item.normalizedName}
          size="sm"
          className="shrink-0 bg-surface-container-low"
        />
        <span className="flex-1 text-body-lg text-on-surface">
          {item.normalizedName}
        </span>
        {item.usedIn.length > 1 && (
          <span className="shrink-0 rounded-full bg-primary-container px-2.5 py-1 text-label-sm text-on-primary-container">
            {item.usedIn.length}끼니
          </span>
        )}
      </div>

      {/* 어느 끼니에 쓰는지 붙여 둔다 — "이거 왜 사야 하지"에 바로 답이 된다. */}
      <ul className="flex flex-wrap gap-1.5">
        {item.usedIn.map((usage) => (
          <li key={`${usage.date}-${usage.mealType}-${usage.recipeId}`}>
            <Link
              href={`/recipes/${usage.recipeId}`}
              className="inline-flex min-h-8 items-center rounded-full bg-surface-container px-2.5 text-label-sm text-on-surface-variant"
            >
              {formatShortDate(usage.date)} {MEAL_LABEL[usage.mealType]} ·{" "}
              {usage.recipeName}
            </Link>
          </li>
        ))}
      </ul>

      {item.outOfSeason && (
        <p className="flex items-center gap-1.5 text-label-md text-on-surface-variant">
          <span className="material-symbols-outlined text-[18px]" aria-hidden>
            calendar_month
          </span>
          지금 제철이 아니에요
        </p>
      )}
    </Card>
  );
}

function formatShortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function ShoppingListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      {[0, 1, 2].map((index) => (
        <Card
          key={index}
          className="h-20 animate-pulse bg-surface-container-low shadow-none"
        />
      ))}
      <span className="sr-only">장보기 목록을 불러오는 중이에요</span>
    </div>
  );
}
