import { RecipeDetailView } from "@/components/recipes/RecipeDetailView";

// 재료 / 조리법 / 영양정보 / 부족재료 + 요리함 체크리스트 (FR-05-01, FR-08-02).
export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <RecipeDetailView id={id} />;
}
