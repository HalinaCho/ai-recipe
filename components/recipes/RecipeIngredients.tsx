import type { RecipeIngredientDetail } from "@/types/api";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { cn } from "@/lib/utils";

/**
 * 상세 화면의 재료 목록.
 *
 * 두 가지를 눈으로 갈라 보여준다.
 * 1. 주재료 — 있는 것(민트·체크) / 없는 것(점선·장바구니). 매칭률의 근거다.
 * 2. 양념 — FR-07-02 화이트리스트. 집에 있다고 보고 매칭에서 뺐으므로,
 *    "없음"으로 빨갛게 칠해 겁주지 않고 회색 알약으로만 나열한다.
 */
export function RecipeIngredients({
  ingredients,
}: {
  ingredients: RecipeIngredientDetail[];
}) {
  const mains = ingredients.filter((item) => item.role === "main");
  const seasonings = ingredients.filter((item) => item.role === "seasoning");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-headline-md text-on-surface">재료</h2>

      {mains.length > 0 && (
        <ul className="flex flex-col gap-2">
          {mains.map((item) => (
            <li
              key={item.normalizedName}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-xl p-3",
                item.inStock
                  ? "bg-tertiary-container"
                  : "border-2 border-dashed border-outline-variant bg-surface-container-low",
              )}
            >
              <IngredientIcon
                normalizedName={item.normalizedName}
                size="sm"
                className="shrink-0 bg-surface-container-lowest"
              />
              <span
                className={cn(
                  "flex-1 text-body-lg",
                  item.inStock ? "text-on-tertiary-container" : "text-on-surface",
                )}
              >
                {item.normalizedName}
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 text-label-md",
                  item.inStock
                    ? "text-on-tertiary-container"
                    : "text-on-error-container",
                )}
              >
                <span
                  className="material-symbols-outlined text-[18px]"
                  aria-hidden
                >
                  {item.inStock ? "check_circle" : "shopping_basket"}
                </span>
                {item.inStock ? "있어요" : "사야 해요"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {seasonings.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-3">
          <p className="text-label-md text-on-surface-variant">
            양념 — 집에 있다고 보고 매칭에서 뺐어요
          </p>
          <ul className="flex flex-wrap gap-2">
            {seasonings.map((item) => (
              <li
                key={item.normalizedName}
                className="rounded-full bg-surface-container-lowest px-3 py-1.5 text-label-md text-on-surface-variant"
              >
                {item.normalizedName}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
