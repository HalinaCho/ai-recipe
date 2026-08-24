"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PreviewBadge } from "@/components/ui/PreviewBadge";
import { parseCategories } from "@/lib/recipes/meal-suitability";
import { parseMoods } from "@/lib/recipes/mood";
import { useRecipes } from "@/lib/hooks/use-recipes";
import { RecipeCard } from "./RecipeCard";
import { RecipeCategoryFilter } from "./RecipeCategoryFilter";
import { RecipeFreshnessBanner } from "./RecipeFreshnessBanner";
import { RecipeMoodFilter } from "./RecipeMoodFilter";
import { RecipeSearchInput } from "./RecipeSearchInput";
import {
  RecipeEmptyState,
  RecipeErrorCard,
  RecipeListSkeleton,
} from "./RecipeStates";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * FR-09-02: 온디맨드 전체 레시피 목록. 서버가 매칭 점수 내림차순으로 주므로
 * 여기서 다시 정렬하지 않는다 — 첫 장이 곧 "지금 가장 만들 만한 것"이다.
 */
export function RecipeList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 검색어·종류 필터를 주소(쿼리스트링)에 실어 둔다. 상세 화면에 들어갔다
  // 뒤로가기로 돌아오면 이 컴포넌트는 통째로 다시 마운트되는데, 처음 상태를
  // 여기서 복원하지 않으면 방금 검색한 게 사라진 것처럼 보인다(실제 버그로
  // 보고됨).
  const [categories, setCategories] = useState<string[]>(() =>
    parseCategories(searchParams.get("categories")),
  );
  const [moods, setMoods] = useState<string[]>(() =>
    parseMoods(searchParams.get("moods")),
  );

  // 입력창엔 타이핑하는 즉시 보여주고, 실제 검색(쿼리)은 멈춘 뒤 잠깐
  // 기다렸다 보낸다. 지울 때는 기다리지 않고 바로 비운다 — "지우기"를
  // 눌렀는데 결과가 300ms 늦게 사라지면 오히려 어색하다.
  const [searchInput, setSearchInputRaw] = useState(
    () => searchParams.get("q")?.trim() ?? "",
  );
  const [search, setSearch] = useState(searchInput);
  const setSearchInput = (next: string) => {
    setSearchInputRaw(next);
    if (next === "") setSearch("");
  };

  useEffect(() => {
    if (searchInput === "") return;
    const timer = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 검색어·필터가 바뀔 때마다 주소를 따라오게 한다. push가 아니라 replace를
  // 쓴다 — 필터를 세 번 눌렀다고 뒤로가기를 세 번 눌러야 레시피 탭을
  // 벗어나면 오히려 헷갈린다. ?preview= 같은 다른 쿼리는 그대로 둔다.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (categories.length > 0) params.set("categories", categories.join(","));
    else params.delete("categories");
    if (moods.length > 0) params.set("moods", moods.join(","));
    else params.delete("moods");
    if (search) params.set("q", search);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // searchParams를 의존성에 넣으면 이 replace가 만든 변화가 다시 이
    // effect를 불러 무한 루프가 된다 — categories/moods/search가 바뀔 때만 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, moods, search, pathname, router]);

  const { data, isPending, isError, error, refetch, dataUpdatedAt } =
    useRecipes(categories, moods, search);
  const recipes = data?.recipes ?? [];
  const filtering = categories.length > 0 || moods.length > 0;
  const searching = search !== "";

  return (
    <div className="flex flex-col gap-3">
      <PreviewBadge />
      <RecipeFreshnessBanner dataUpdatedAt={dataUpdatedAt} />

      <RecipeSearchInput value={searchInput} onChange={setSearchInput} />
      <RecipeCategoryFilter selected={categories} onChange={setCategories} />
      <RecipeMoodFilter selected={moods} onChange={setMoods} />

      {isPending && <RecipeListSkeleton />}

      {isError && (
        <RecipeErrorCard
          message={error instanceof Error ? error.message : "알 수 없는 오류예요."}
          onRetry={() => void refetch()}
        />
      )}

      {/* 검색으로 빈 경우, 필터로 빈 경우, 재고가 없어서 빈 경우는 원인이
          다 달라 안내도 달라야 한다. 재고를 채우라고 하면 엉뚱한 조언이 된다. */}
      {!isPending && !isError && recipes.length === 0 && searching && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body-lg text-on-surface">
            &ldquo;{search}&rdquo;와 맞는 레시피가 없어요.
          </p>
          <Button variant="secondary" onClick={() => setSearchInput("")}>
            검색 지우기
          </Button>
        </Card>
      )}

      {!isPending && !isError && recipes.length === 0 && !searching && filtering && (
        <Card className="flex flex-col gap-3 p-4">
          <p className="text-body-lg text-on-surface">
            고른 종류·기분에는 맞는 레시피가 없어요.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setCategories([]);
              setMoods([]);
            }}
          >
            전체 보기
          </Button>
        </Card>
      )}

      {!isPending && !isError && recipes.length === 0 && !searching && !filtering && (
        <RecipeEmptyState />
      )}

      {recipes.length > 0 && (
        <>
          <p className="px-1 text-label-md text-on-surface-variant">
            {searching
              ? `"${search}"로 찾은 레시피예요.`
              : filtering
                ? `${[...categories, ...moods].join("·")} 중에서 지금 있는 재료로 만들기 좋은 순서예요.`
                : "지금 있는 재료로 만들기 좋은 순서예요. 오래 둔 재료를 먼저 쓰는 요리를 위로 올렸어요."}
          </p>
          <ul className="flex flex-col gap-3">
            {recipes.map((recipe, index) => (
              <li key={recipe.id}>
                <RecipeCard recipe={recipe} featured={index === 0} />
              </li>
            ))}
          </ul>
          <p className="px-1 pt-1 text-label-md text-on-surface-variant">
            모두 {recipes.length}개의 레시피를 찾았어요.
          </p>
        </>
      )}
    </div>
  );
}
