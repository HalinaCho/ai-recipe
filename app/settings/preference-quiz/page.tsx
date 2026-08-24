import Link from "next/link";
import { TopAppBar } from "@/components/ui/TopAppBar";
import { PreferenceQuizView } from "@/components/recipes/PreferenceQuizView";

export default function PreferenceQuizPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar
        title="취향 설정"
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
        <PreferenceQuizView />
      </div>
    </div>
  );
}
