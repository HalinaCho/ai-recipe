import { TopAppBar } from "@/components/ui/TopAppBar";
import { MealPlanView } from "@/components/meal-plan/MealPlanView";

// 식단표 탭 — 주간 자동 배치 결과와 끼니 교체 (FR-11 ~ FR-14).
export default function MealPlanPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar title="식단표" />
      <div className="px-container-padding pb-4">
        <MealPlanView />
      </div>
    </div>
  );
}
