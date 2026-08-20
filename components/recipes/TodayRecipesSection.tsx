"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { useTodayRecipes } from "@/lib/hooks/use-recipes";
import { RecipeCard } from "./RecipeCard";
import { RecipeEmptyState, RecipeListSkeleton } from "./RecipeStates";

/**
 * FR-09-01 홈 "오늘의 추천 레시피". 서버가 하루 단위로 고정해서 주는 목록을
 * 그대로 쓴다 — 홈에 들를 때마다 추천이 바뀌면 "오늘의" 추천이 아니게 된다.
 *
 * 실패했을 때도 홈 전체가 깨지지 않도록, 이 섹션은 조용한 카드 한 장으로만
 * 물러난다 (홈의 본래 일인 재고 요약·동기화는 계속 보여야 한다).
 */
export function TodayRecipesSection() {
  const { data, isPending, isError } = useTodayRecipes();
  const recipes = data?.recipes ?? [];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between">
        <h2 className="text-headline-md text-on-surface">오늘의 추천 레시피</h2>
        <Link
          href="/recipes"
          className="flex min-h-12 items-center text-label-md text-primary"
        >
          전체 보기
          <span className="material-symbols-outlined text-base">
            chevron_right
          </span>
        </Link>
      </div>

      {isPending && <RecipeListSkeleton rows={2} />}

      {isError && (
        <Card className="flex items-center gap-3 p-4">
          <span className="text-3xl" aria-hidden>
            🍳
          </span>
          <p className="text-body-md text-on-surface-variant">
            오늘의 추천을 아직 못 가져왔어요. 잠시 뒤에 다시 들러주세요.
          </p>
        </Card>
      )}

      {!isPending && !isError && recipes.length === 0 && <RecipeEmptyState />}

      {recipes.length > 0 && (
        <ul className="flex flex-col gap-3">
          {recipes.map((recipe, index) => (
            <li key={recipe.id}>
              <RecipeCard recipe={recipe} featured={index === 0} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
