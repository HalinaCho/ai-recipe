import { TopAppBar } from "@/components/ui/TopAppBar";
import { InventoryList } from "@/components/inventory/InventoryList";

// FR-04 / FR-05-02 / FR-19 — 구매일이 오래된 순(FIFO) 단일 리스트.
// PRD v1.3에서 3섹션(오늘/이번주/여유) 구조는 삭제됐으므로 그룹 없이 한 줄로 이어진다.
export default function InventoryPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar title="재고" />
      <div className="px-container-padding pb-4">
        <InventoryList />
      </div>
    </div>
  );
}
