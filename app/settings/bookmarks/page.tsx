import Link from "next/link";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { BookmarkedRecipeList } from "@/components/recipes/BookmarkedRecipeList";

export default function BookmarksPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar
        title="레시피 북마크"
        action={
          <Link
            href="/settings"
            aria-label="마이페이지로 돌아가기"
            className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </Link>
        }
      />
      <div className="px-container-padding pb-4">
        <BookmarkedRecipeList />
      </div>
    </div>
  );
}
