"use client";

import { useFixturePreview } from "@/lib/hooks/fixture-preview";

/**
 * Visible marker for `?preview=fixtures` so sample data is never mistaken for
 * a real household's inventory. Renders nothing in normal use.
 */
export function PreviewBadge() {
  const preview = useFixturePreview();
  if (!preview) return null;

  return (
    <p className="flex items-center gap-2 rounded-xl bg-secondary-container px-3 py-2 text-label-md text-on-secondary-container">
      <span className="material-symbols-outlined text-[18px]">visibility</span>
      화면 확인용 샘플 데이터예요 (?preview=off 로 끄기)
    </p>
  );
}
