import { TopAppBar } from "@/components/ui/TopAppBar";
import { Card } from "@/components/ui/Card";

// M0 shell — real FIFO-ordered inventory list ships in M1 (FR-04, FR-05).
export default function InventoryPage() {
  return (
    <div className="flex flex-col gap-4">
      <TopAppBar title="재고" />
      <div className="px-container-padding">
        <Card>
          <p className="text-body-md text-on-surface-variant">
            메일 연동 후 구매일 오래된 순으로 재고가 표시돼요.
          </p>
        </Card>
      </div>
    </div>
  );
}
