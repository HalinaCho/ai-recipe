"use client";

import { useToggleRecipeBookmark } from "@/lib/hooks/use-recipe-bookmarks";
import { cn } from "@/lib/utils";

export interface BookmarkButtonProps {
  recipeId: string;
  bookmarked: boolean;
}

/**
 * 레시피 상세의 북마크 토글.
 *
 * 안 담았으면 bookmark_add(북마크+플러스), 담았으면 bookmark_added(북마크+체크)
 * 로 아이콘 자체가 바뀌고, 배경·글자 색도 함께 바뀐다 — 아이콘 모양 차이만으로는
 * 얼핏 봐서 담긴 상태인지 구분이 잘 안 된다.
 */
export function BookmarkButton({ recipeId, bookmarked }: BookmarkButtonProps) {
  const toggle = useToggleRecipeBookmark(recipeId);

  // 누른 즉시 상태가 바뀌어 보여야 "눌렸다"는 게 확실해진다. 요청이 실패하면
  // 서버 응답 없이 mutation이 끝나 bookmarked(서버 상태)로 되돌아가고,
  // onError 없이도 화면이 원래대로 돌아온다.
  const showAsBookmarked = toggle.isPending
    ? (toggle.variables ?? bookmarked)
    : bookmarked;

  return (
    <button
      type="button"
      onClick={() => toggle.mutate(!showAsBookmarked)}
      disabled={toggle.isPending}
      aria-pressed={showAsBookmarked}
      aria-label={showAsBookmarked ? "북마크에서 빼기" : "북마크에 담기"}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 disabled:opacity-60",
        showAsBookmarked
          ? "bg-primary-container text-primary"
          : "bg-surface-container-low text-on-surface-variant",
      )}
    >
      <span className="material-symbols-outlined text-2xl" aria-hidden>
        {showAsBookmarked ? "bookmark_added" : "bookmark_add"}
      </span>
    </button>
  );
}
