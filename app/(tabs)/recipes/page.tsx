import { Suspense } from "react";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { RecipeList } from "@/components/recipes/RecipeList";
import { RecipeListSkeleton } from "@/components/recipes/RecipeStates";

// FR-08 / FR-09-02 — 매칭률순 온디맨드 레시피 목록.
export default function RecipesPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar title="레시피" />
      <div className="px-container-padding pb-4">
        {/* RecipeList가 useSearchParams로 검색어·필터를 주소에서 복원한다
            (FR-09-04) — Next.js가 이 훅을 쓰는 컴포넌트에 Suspense 경계를
            요구한다. */}
        <Suspense fallback={<RecipeListSkeleton />}>
          <RecipeList />
        </Suspense>
      </div>
    </div>
  );
}
