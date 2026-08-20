import { TopAppBar } from "@/components/ui/TopAppBar";
import { Card } from "@/components/ui/Card";

// M0 shell — 매칭 스코어링 기반 레시피 목록은 M2에서 구현 (FR-08, FR-09).
export default function RecipesPage() {
  return (
    <div className="flex flex-col gap-4">
      <TopAppBar title="레시피" />
      <div className="px-container-padding">
        <Card>
          <p className="text-body-md text-on-surface-variant">
            재고가 쌓이면 매칭률 순으로 레시피를 보여드려요.
          </p>
        </Card>
      </div>
    </div>
  );
}
