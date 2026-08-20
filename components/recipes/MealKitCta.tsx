import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * FR-10-01 / FR-10-02: 매칭률이 애매한 레시피에 붙는 "밀키트로 간편하게" 자리.
 *
 * 실제 상품 연결은 Phase 4다. 그래서 여기서는 아무 데도 안 가는 링크를 두는
 * 대신, 눌리지 않는 자리로 두고 "준비 중"이라고 그대로 말한다 — 눌렀는데
 * 아무 일도 안 일어나는 쪽이 훨씬 고장 난 것처럼 보인다.
 */

export function MealKitInlineCta({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-xl bg-secondary-container px-3 py-2.5 text-label-md text-on-secondary-container",
        className,
      )}
    >
      <span className="material-symbols-outlined text-[20px]" aria-hidden>
        bento
      </span>
      <span className="flex-1">밀키트로 간편하게</span>
      <span className="rounded-full bg-surface-container-lowest/70 px-2 py-0.5 text-label-sm">
        준비 중
      </span>
    </p>
  );
}

export function MealKitBlockCta() {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-secondary-container p-4">
      <p className="flex items-center gap-2 text-body-lg text-on-secondary-container">
        <span className="material-symbols-outlined text-2xl" aria-hidden>
          bento
        </span>
        밀키트로 간편하게 만들어보기
      </p>
      <p className="text-body-md text-on-secondary-container">
        재료를 하나하나 사기 번거로우면 밀키트가 편해요. 지금은 준비 중이고,
        곧 바로 담을 수 있게 열어드릴게요.
      </p>
      <Button
        variant="secondary"
        disabled
        className="mt-1 w-full"
        aria-label="밀키트 연결 준비 중"
      >
        준비 중이에요
      </Button>
    </div>
  );
}
