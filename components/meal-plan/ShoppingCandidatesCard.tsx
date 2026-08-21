"use client";

import type { MealPlanSlot } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IngredientIcon } from "@/components/ui/IngredientIcon";

/**
 * FR-13-05 장보기 후보.
 *
 * 부족 재료는 끼니마다 흩어져 있지만 장은 한 번에 본다. 그래서 주 단위로 한 번
 * 모아 보여주고(같은 재료는 합친다), 몇 끼에 쓰이는지도 같이 적는다.
 *
 * 실제 쿠팡·네이버쇼핑 연결은 Phase 4(FR-17·FR-18)라서 아직 갈 곳이 없다.
 * 눌러도 아무 일 없는 버튼을 두면 앱이 고장 난 것처럼 보이므로, 자리만 잡아두고
 * 잠가둔다 — 레시피 상세의 MissingIngredientsBlock과 같은 처리다.
 */
export function ShoppingCandidatesCard({ slots }: { slots: MealPlanSlot[] }) {
  const counts = new Map<string, number>();
  for (const slot of slots) {
    for (const name of slot.missingMainIngredients) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return (
      <Card className="flex items-start gap-3 p-4">
        <span className="material-symbols-outlined text-2xl text-tertiary">
          check_circle
        </span>
        <p className="text-body-md text-on-surface-variant">
          이번 주 식단은 있는 재료로 다 되네요. 장 안 보셔도 돼요.
        </p>
      </Card>
    );
  }

  // 여러 끼니에 걸치는 재료가 위로 — 한 번 사면 여러 번 쓰는 것부터 담는 게 낫다.
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline-md text-on-surface">
          장볼 재료 {ranked.length}개
        </h2>
        <p className="text-body-md text-on-surface-variant">
          이번 주 식단에 부족한 재료예요. 미리 사두면 그대로 만들 수 있어요.
        </p>
      </div>

      <ul className="flex flex-wrap gap-2">
        {ranked.map(([name, count]) => (
          <li
            key={name}
            className="flex min-h-12 items-center gap-2 rounded-xl bg-error-container px-3 py-2 text-body-md text-on-error-container"
          >
            <IngredientIcon
              normalizedName={name}
              size="sm"
              className="bg-surface-container-lowest"
            />
            <span>{name}</span>
            {count > 1 && (
              <span className="text-label-sm">{count}끼</span>
            )}
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        disabled
        className="w-full"
        aria-label="장보기 연결 준비 중"
      >
        장보기 연결 준비 중
      </Button>
    </Card>
  );
}
