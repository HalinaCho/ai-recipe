import { Chip } from "@/components/ui/Chip";

/**
 * Deliberate placeholder for 오늘의 추천 레시피 (Phase 2 / FR-09). No fake
 * recipe data — just an honest "coming soon" slot that keeps the home layout
 * from collapsing before the matching engine exists.
 */
export function RecipeTeaserCard() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-headline-md text-on-surface">오늘의 추천 레시피</h2>
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-outline-variant bg-surface-container-low p-6 text-center">
        <span className="text-4xl" aria-hidden>
          🍳
        </span>
        <Chip tone="tertiary">곧 만나요</Chip>
        <p className="text-body-md text-on-surface-variant">
          재고가 어느 정도 쌓이면, 지금 있는 재료로 만들 수 있는 요리를 매일
          한 가지씩 골라드릴게요.
        </p>
      </div>
    </section>
  );
}
