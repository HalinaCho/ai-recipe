import { TopAppBar } from "@/components/ui/TopAppBar";
import { Card } from "@/components/ui/Card";

// M0 shell — 재료 기준 통합 장보기 리스트는 M4에서 구현 (FR-16~FR-18).
export default function ShoppingPage() {
  return (
    <div className="flex flex-col gap-4">
      <TopAppBar title="장보기" />
      <div className="px-container-padding">
        <Card>
          <p className="text-body-md text-on-surface-variant">
            식단표가 채워지면 부족한 재료를 모아서 보여드려요.
          </p>
        </Card>
      </div>
    </div>
  );
}
