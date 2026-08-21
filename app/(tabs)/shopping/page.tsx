import { TopAppBar } from "@/components/ui/TopAppBar";
import { ShoppingListView } from "@/components/shopping/ShoppingListView";

export default function ShoppingPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TopAppBar title="장보기" />
      <div className="px-container-padding">
        <ShoppingListView />
      </div>
    </div>
  );
}
