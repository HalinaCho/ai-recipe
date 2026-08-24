"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RecipeImage } from "@/components/recipes/RecipeImage";
import { RecipeErrorCard } from "@/components/recipes/RecipeStates";
import {
  usePreferenceQuiz,
  useSubmitPreferenceRating,
} from "@/lib/hooks/use-preference-quiz";
import type { RecipePreferenceRating } from "@/types/api";

/**
 * 마이페이지 → 취향 설정 (추천 알고리즘 V2 Level 1).
 *
 * 신호가 쌓이길 기다리지 않고 사용자가 직접 좋아요/보통/싫어요를 매겨 취향
 * 프로필을 즉시 만든다. 카드마다 서버 왕복을 기다리지 않고 바로 다음 카드로
 * 넘어간다 — 평가 저장은 배경에서 조용히 끝나면 된다.
 */
export function PreferenceQuizView() {
  const { data, isPending, isError, error, refetch, isFetching } =
    usePreferenceQuiz();
  const submit = useSubmitPreferenceRating();
  const [index, setIndex] = useState(0);

  const cards = data?.cards ?? [];

  // 새 배치가 도착하면(첫 로딩 포함) 처음 카드부터 다시 본다.
  useEffect(() => {
    setIndex(0);
  }, [data]);

  if (isPending) return <QuizSkeleton />;

  if (isError) {
    return (
      <RecipeErrorCard
        title="취향 퀴즈를 불러오지 못했어요"
        message={error instanceof Error ? error.message : "알 수 없는 오류예요."}
        onRetry={() => void refetch()}
      />
    );
  }

  if (cards.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <span className="text-6xl" aria-hidden>
          🎉
        </span>
        <p className="text-headline-md text-on-surface">
          평가할 카드가 더 없어요
        </p>
        <p className="text-body-md text-on-surface-variant">
          이미 대부분의 레시피를 평가했어요. 나중에 다시 들러주세요.
        </p>
      </Card>
    );
  }

  const currentCard = cards[index];
  const finishedBatch = index >= cards.length;
  const totalRated = data.ratedCount + Math.min(index, cards.length);

  const handleRate = (rating: RecipePreferenceRating) => {
    if (!currentCard) return;
    submit.mutate({ recipeId: currentCard.id, rating });
    setIndex((i) => i + 1);
  };

  if (finishedBatch) {
    return (
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <span className="text-6xl" aria-hidden>
          👍
        </span>
        <p className="text-headline-md text-on-surface">수고하셨어요!</p>
        <p className="text-body-md text-on-surface-variant">
          지금까지 총 {totalRated}개의 취향을 알았어요. 레시피 추천에 바로
          반영돼요.
        </p>
        <Button
          className="w-full"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? "불러오는 중..." : "더 평가하기"}
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-label-md text-on-surface-variant">
        {index + 1} / {cards.length} · 지금까지 {totalRated}개 평가했어요
      </p>

      <Card className="flex flex-col gap-4 p-4">
        <RecipeImage
          src={currentCard.imageUrl}
          alt={currentCard.name}
          fallbackName={currentCard.name}
          size="hero"
          width={360}
          height={360}
          className="mx-auto aspect-square w-full max-w-[280px] rounded-xl bg-surface-container-low"
        />
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-headline-md text-on-surface">
            {currentCard.name}
          </p>
          {currentCard.category && (
            <span className="rounded-full bg-secondary-container px-2.5 py-1 text-label-sm text-on-secondary-container">
              {currentCard.category}
            </span>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="secondary"
          className="flex-col gap-1 px-2 py-3"
          onClick={() => handleRate("dislike")}
        >
          <span className="text-2xl" aria-hidden>
            👎
          </span>
          싫어요
        </Button>
        <Button
          variant="ghost"
          className="flex-col gap-1 border-2 border-outline-variant px-2 py-3"
          onClick={() => handleRate("neutral")}
        >
          <span className="text-2xl" aria-hidden>
            😐
          </span>
          보통이에요
        </Button>
        <Button
          className="flex-col gap-1 px-2 py-3"
          onClick={() => handleRate("like")}
        >
          <span className="text-2xl" aria-hidden>
            👍
          </span>
          좋아요
        </Button>
      </div>
    </div>
  );
}

function QuizSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <span className="h-4 w-40 animate-pulse rounded-full bg-surface-container-low" />
      <Card className="flex flex-col gap-4 p-4">
        <span className="mx-auto aspect-square w-full max-w-[280px] animate-pulse rounded-xl bg-surface-container-low" />
        <span className="mx-auto h-6 w-32 animate-pulse rounded-full bg-surface-container-low" />
      </Card>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-20 animate-pulse rounded-xl bg-surface-container-low"
          />
        ))}
      </div>
      <span className="sr-only">취향 퀴즈를 불러오는 중이에요</span>
    </div>
  );
}
