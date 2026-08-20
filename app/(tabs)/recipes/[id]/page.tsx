import { TopAppBar } from "@/components/ui/TopAppBar";
import { Card } from "@/components/ui/Card";

// M0 shell — 상세(재료/조리법/영양정보/부족재료+쇼핑 CTA)는 M2·M4에서 구현.
export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-4">
      <TopAppBar title="레시피 상세" />
      <div className="px-container-padding">
        <Card>
          <p className="text-body-md text-on-surface-variant">
            레시피 #{id}는 M2에서 실제 데이터로 채워져요.
          </p>
        </Card>
      </div>
    </div>
  );
}
