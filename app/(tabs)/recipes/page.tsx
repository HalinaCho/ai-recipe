import { TopAppBar } from "@/components/ui/TopAppBar";
import { RecipeList } from "@/components/recipes/RecipeList";

// FR-08 / FR-09-02 — 매칭률순 온디맨드 레시피 목록.
export default function RecipesPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar title="레시피" />
      <div className="px-container-padding pb-4">
        <RecipeList />
      </div>
    </div>
  );
}
