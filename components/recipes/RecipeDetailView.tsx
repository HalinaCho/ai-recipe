"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { PreviewBadge } from "@/components/ui/PreviewBadge";
import { useRecipeDetail } from "@/lib/hooks/use-recipes";
import { CookChecklistModal } from "./CookChecklistModal";
import {
  formatCalories,
  formatExpiringReason,
  formatOwnedSummary,
} from "./format";
import { MatchMeter } from "./MatchMeter";
import { MealKitBlockCta } from "./MealKitCta";
import { MissingIngredientsBlock } from "./MissingIngredientsBlock";
import { RecipeImage } from "./RecipeImage";
import { RecipeIngredients } from "./RecipeIngredients";
import { RecipeNutrition } from "./RecipeNutrition";
import { RecipeErrorCard } from "./RecipeStates";

/**
 * 레시피 상세 (PRD §4.1: 재료 / 조리법 / 영양정보 / 부족재료+쇼핑 CTA)와
 * FR-05-01 "요리함" 진입점.
 */
export function RecipeDetailView({ id }: { id: string }) {
  const { data, isPending, isError, error, refetch } = useRecipeDetail(id);
  const [cookOpen, setCookOpen] = useState(false);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar
        title="레시피 상세"
        action={
          <Link
            href="/recipes"
            aria-label="레시피 목록으로 돌아가기"
            className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </Link>
        }
      />

      <div className="flex flex-col gap-8 px-container-padding pb-4">
        <PreviewBadge />

        {isPending && <RecipeDetailSkeleton />}

        {isError && (
          <RecipeErrorCard
            title="레시피를 불러오지 못했어요"
            message={
              error instanceof Error ? error.message : "알 수 없는 오류예요."
            }
            onRetry={() => void refetch()}
          />
        )}

        {data && (
          <>
            {/* 완성 사진. 데이터는 처음부터 들어와 있었는데 화면에서 쓰지
                않고 있었다 — 무엇을 만드는지 한눈에 보이는 게 조리법 열 줄보다
                먼저다. 16:9로 잘라 재료 목록이 화면 밖으로 밀려나지 않게 한다. */}
            <RecipeImage
              src={data.imageUrl}
              alt={`${data.name} 완성 사진`}
              fallbackName={data.name}
              size="hero"
              className="aspect-video w-full rounded-xl bg-surface-container-low shadow-tinted"
            />

            <header className="flex flex-col gap-3">
              <h2 className="text-headline-lg text-on-surface">{data.name}</h2>
              <p className="text-body-md text-on-surface-variant">
                {formatOwnedSummary(data.match)}
                {formatCalories(data.nutrition.calories) &&
                  ` · ${formatCalories(data.nutrition.calories)}`}
              </p>
              <MatchMeter match={data.match} />
              {formatExpiringReason(data.match) && (
                <p className="flex items-start gap-1.5 rounded-xl bg-tertiary-container px-3 py-2.5 text-label-md text-on-tertiary-container">
                  <span
                    className="material-symbols-outlined text-[18px] leading-5"
                    aria-hidden
                  >
                    schedule
                  </span>
                  <span>
                    오래 둔 재료를 먼저 쓸 수 있어서 골랐어요 —{" "}
                    {formatExpiringReason(data.match)}
                  </span>
                </p>
              )}
            </header>

            <RecipeIngredients ingredients={data.ingredients} />

            <MissingIngredientsBlock
              missing={data.match.missingMainIngredients}
            />

            {data.showMealKitCta && <MealKitBlockCta />}

            {data.instructions.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-headline-md text-on-surface">조리법</h2>
                {/* FR-06-03: 단계마다 그 장면의 사진을 함께 둔다. 글만 있으면
                    "적당히 볶는다"가 어느 정도인지 알 수 없다. 사진을 글 위에
                    두는 이유는 요리 중에는 화면을 스크롤하며 흘깃 보기 때문 —
                    먼저 보이는 것이 그림이어야 지금 어느 단계인지 빨리 잡힌다. */}
                <ol className="flex flex-col gap-3">
                  {data.instructions.map((step, index) => (
                    <li
                      key={index}
                      className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-tinted"
                    >
                      {step.imageUrl && (
                        <RecipeImage
                          src={step.imageUrl}
                          alt={`${index + 1}단계`}
                          fallbackName={data.name}
                          size="step"
                          className="aspect-video w-full rounded-lg bg-surface-container-low"
                        />
                      )}
                      <div className="flex gap-3">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-label-md text-on-primary-container"
                          aria-hidden
                        >
                          {index + 1}
                        </span>
                        <p className="flex-1 text-body-lg text-on-surface">
                          {step.text}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <RecipeNutrition nutrition={data.nutrition} />

            {/* 하단 탭바(약 72px) 위에 떠 있다가 끝에서 자리를 잡는다.
                뒤 글씨가 비쳐 보이면 고장 난 것처럼 읽히므로 불투명하게 둔다. */}
            <div className="sticky bottom-24 z-20 flex flex-col gap-1.5 rounded-xl bg-surface-container-lowest p-3 shadow-tinted ring-1 ring-outline-variant">
              <Button className="w-full" onClick={() => setCookOpen(true)}>
                <span className="material-symbols-outlined text-[20px]" aria-hidden>
                  skillet
                </span>
                이 레시피로 요리함
              </Button>
              <p className="text-center text-label-sm text-on-surface-variant">
                쓴 재료를 골라 재고에서 뺄 수 있어요
              </p>
            </div>

            <CookChecklistModal
              recipeId={data.id}
              recipeName={data.name}
              open={cookOpen}
              onClose={() => setCookOpen(false)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function RecipeDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex flex-col gap-3">
        <span className="block h-8 w-48 animate-pulse rounded-full bg-surface-container" />
        <span className="block h-4 w-32 animate-pulse rounded-full bg-surface-container-low" />
        <span className="block h-3 w-full animate-pulse rounded-full bg-surface-container" />
      </div>
      <Card className="h-40 animate-pulse bg-surface-container-low shadow-none" />
      <Card className="h-32 animate-pulse bg-surface-container-low shadow-none" />
      <span className="sr-only">레시피를 불러오는 중이에요</span>
    </div>
  );
}
