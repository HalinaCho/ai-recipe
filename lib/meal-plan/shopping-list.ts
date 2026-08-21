// FR-17-02·FR-17-03: 한 주 식단표의 부족 재료를 **재료 기준으로** 모은다.
//
// 끼니별로 흩어진 "부족한 재료"를 그대로 늘어놓으면 대파가 세 번 적힌 목록이
// 되어 마트에서 몇 개를 사야 할지 오히려 헷갈린다. 재료 하나에 "어느 끼니에
// 쓰는지"를 붙여 한 줄로 묶는다.
//
// 필요 수량을 합산하지는 않는다 (FR-17-03). 계량 표기가 "1모"·"300ml"·"5마리"로
// 제각각이라 더하려면 단위 환산이 필요한데, 그건 FR-05-04에서 하지 않기로 한
// 일이다. 어설프게 더한 숫자는 틀린 채로 확신을 주기 때문에 안 하느니만 못하다.

import { monthOf, outOfSeasonPurchases } from "@/lib/ingredients/seasonality";
import type { MealPlanSlot, ShoppingListEntry } from "@/types/api";

/**
 * 슬롯 목록 → 재료 기준 장보기 목록.
 *
 * 정렬은 "여러 끼니에 쓰이는 것 → 이름순". 한 번 사면 여러 끼니가 해결되는
 * 재료가 위에 있어야 장바구니를 채우는 순서가 자연스럽다.
 */
export function buildShoppingList(
  slots: readonly MealPlanSlot[],
): ShoppingListEntry[] {
  const byName = new Map<string, ShoppingListEntry>();

  for (const slot of slots) {
    // 제철이 아닌 재료는 이 끼니의 날짜 기준으로 판단한다. 한 주가 월을
    // 걸치면 월요일과 일요일의 제철이 다를 수 있다.
    const month = monthOf(slot.date);

    // FR-13-08: 한 끼니에 요리가 여럿이므로 요리마다 훑는다. 국이 부족한지
    // 반찬이 부족한지가 목록에 남아야 "뭘 포기할지"를 사용자가 고를 수 있다.
    for (const dish of slot.dishes) {
      const outOfSeason = new Set(
        outOfSeasonPurchases(dish.missingMainIngredients, month),
      );

      for (const name of dish.missingMainIngredients) {
        const found = byName.get(name);
        const usage = {
          recipeId: dish.recipe.id,
          recipeName: dish.recipe.name,
          date: slot.date,
          mealType: slot.mealType,
          role: dish.role,
        };

        if (found) {
          // 같은 레시피가 한 주에 두 번 오지는 않지만(FR-13-02), 스왑으로
          // 같은 요리가 다른 끼니에 들어올 수는 있다. 요리 기준으로 센다.
          found.usedIn.push(usage);
          // 한 번이라도 제철이면 "제철 아님" 딱지를 떼 준다 — 언제 사도 되는
          // 재료를 계속 경고하면 경고가 무뎌진다.
          found.outOfSeason = found.outOfSeason && outOfSeason.has(name);
        } else {
          byName.set(name, {
            normalizedName: name,
            usedIn: [usage],
            outOfSeason: outOfSeason.has(name),
          });
        }
      }
    }
  }

  return [...byName.values()].sort(
    (a, b) =>
      b.usedIn.length - a.usedIn.length ||
      a.normalizedName.localeCompare(b.normalizedName, "ko"),
  );
}
