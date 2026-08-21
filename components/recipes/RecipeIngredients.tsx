import type { RecipeIngredientDetail } from "@/types/api";
import { IngredientIcon } from "@/components/ui/IngredientIcon";
import { cn } from "@/lib/utils";

/**
 * 상세 화면의 재료 목록.
 *
 * 세 가지를 눈으로 갈라 보여준다.
 * 1. **원문 그룹** — "육수" · "고명" · "고기 밑간" (FR-07-03). 원본에 그룹이
 *    있는 레시피가 17%뿐이라 대개 한 덩어리지만, 있을 때는 그대로 살린다.
 *    묶여 있으면 "이건 육수용이구나"가 한눈에 잡혀 장 볼 때 판단이 빨라진다.
 * 2. **보유 여부** — 있는 것(민트·체크) / 없는 것(점선·장바구니). 매칭률의 근거다.
 * 3. **양념** — FR-07-02 화이트리스트. 집에 있다고 보고 매칭에서 뺐으므로,
 *    "없음"으로 빨갛게 칠해 겁주지 않고 회색 알약으로만 나열한다.
 *
 * 계량(FR-07-03)은 재료명 옆에 원문 그대로 붙인다. 못 뽑은 재료는 그 자리를
 * 그냥 비운다 — "계량 미상" 같은 문구를 채우면 목록이 시끄러워지기만 한다.
 */
export function RecipeIngredients({
  ingredients,
}: {
  ingredients: RecipeIngredientDetail[];
}) {
  const mains = ingredients.filter((item) => item.role === "main");
  const seasonings = ingredients.filter((item) => item.role === "seasoning");
  const groups = groupIngredients(mains);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-headline-md text-on-surface">재료</h2>

      {groups.map((group) => (
        <div key={group.name ?? "__ungrouped__"} className="flex flex-col gap-2">
          {group.name && (
            <p className="px-1 text-label-md text-on-surface-variant">
              {group.name}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {group.items.map((item) => (
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
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "truncate text-body-lg",
                      item.inStock
                        ? "text-on-tertiary-container"
                        : "text-on-surface",
                    )}
                  >
                    {item.normalizedName}
                  </span>
                  {item.amount && (
                    <span
                      className={cn(
                        "truncate text-label-md",
                        item.inStock
                          ? "text-on-tertiary-container"
                          : "text-on-surface-variant",
                      )}
                    >
                      {item.amount}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 text-label-md",
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
        </div>
      ))}

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
                {item.amount && (
                  <span className="ml-1.5 text-on-surface-variant/70">
                    {item.amount}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface IngredientGroup {
  /** null = 원문에 그룹이 없는 재료들. 제목 없이 먼저 나온다. */
  name: string | null;
  items: RecipeIngredientDetail[];
}

/**
 * 원문 그룹으로 묶는다. 그룹 없는 재료가 항상 맨 앞이고, 나머지는 원문에
 * 나온 순서를 지킨다 — 원본이 "재료 → 육수 → 양념" 순으로 적어 두었는데
 * 우리가 알파벳순 같은 걸로 다시 정렬하면 조리 흐름이 깨진다.
 */
function groupIngredients(items: RecipeIngredientDetail[]): IngredientGroup[] {
  const ungrouped: RecipeIngredientDetail[] = [];
  const named = new Map<string, RecipeIngredientDetail[]>();

  for (const item of items) {
    if (!item.group) {
      ungrouped.push(item);
      continue;
    }
    const bucket = named.get(item.group);
    if (bucket) bucket.push(item);
    else named.set(item.group, [item]);
  }

  const groups: IngredientGroup[] = [];
  if (ungrouped.length > 0) groups.push({ name: null, items: ungrouped });
  for (const [name, groupItems] of named) {
    groups.push({ name, items: groupItems });
  }

  // 그룹이 딱 하나뿐이면 제목을 붙일 이유가 없다 ("재료" 아래 "재료").
  if (groups.length === 1) return [{ name: null, items: groups[0].items }];
  return groups;
}
