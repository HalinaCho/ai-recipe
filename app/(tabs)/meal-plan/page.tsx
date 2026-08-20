import { TopAppBar } from "@/components/ui/TopAppBar";
import { Card } from "@/components/ui/Card";

// M0 shell — 주간 캘린더 뷰 및 자동 배치는 M3에서 구현 (FR-11~FR-14).
export default function MealPlanPage() {
  return (
    <div className="flex flex-col gap-4">
      <TopAppBar title="식단표" />
      <div className="px-container-padding">
        <Card>
          <p className="text-body-md text-on-surface-variant">
            주간 식단표는 M3에서 자동으로 채워져요.
          </p>
        </Card>
      </div>
    </div>
  );
}
