"use client";

import type { WeeklyNutritionSummary } from "@/types/api";
import { Card } from "@/components/ui/Card";
import { formatNutritionCoverage, formatNutritionValue } from "./format";

const ROWS = [
  { key: "calories", label: "칼로리", unit: "kcal" },
  { key: "carbohydrate", label: "탄수화물", unit: "g" },
  { key: "protein", label: "단백질", unit: "g" },
  { key: "fat", label: "지방", unit: "g" },
  { key: "sodium", label: "나트륨", unit: "mg" },
] as const;

export interface WeeklyNutritionCardProps {
  nutrition: WeeklyNutritionSummary;
  /** 교체 직후처럼 합계가 아직 서버에서 안 온 상태. */
  isStale?: boolean;
}

/**
 * FR-14-01 주간 영양 요약.
 *
 * 합계보다 먼저 "몇 끼 기준인지"를 말한다. 식약처 레시피 중에 영양정보가 비어
 * 있는 것이 실제로 있어서, 숫자만 크게 띄우면 "이번 주는 왜 이렇게 적게 먹지"로
 * 읽힌다. 빠진 끼니 수를 먼저 알려주면 그 오해가 생기지 않는다.
 *
 * FR-14-02: 목표치 대비 비교나 권장량 계산은 하지 않는다 — 정보 제공까지다.
 */
export function WeeklyNutritionCard({
  nutrition,
  isStale = false,
}: WeeklyNutritionCardProps) {
  const { coveredSlots, totalSlots } = nutrition;
  const uncovered = Math.max(totalSlots - coveredSlots, 0);
  const hasNumbers = coveredSlots > 0;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-headline-md text-on-surface">이번 주 영양 요약</h2>
        <p className="text-label-md text-primary" aria-live="polite">
          {formatNutritionCoverage(coveredSlots, totalSlots)}
        </p>
      </div>

      {uncovered > 0 && (
        <p className="rounded-xl bg-surface-container-low px-3 py-2 text-label-md text-on-surface-variant">
          {uncovered}끼는 레시피에 영양정보가 없어서 합계에서 뺐어요. 그만큼 실제
          섭취량은 더 많을 수 있어요.
        </p>
      )}

      {hasNumbers ? (
        <ul className="grid grid-cols-2 gap-2">
          {ROWS.map((row) => (
            <li
              key={row.key}
              className="flex min-h-12 flex-col justify-center rounded-xl bg-surface-container-low px-3 py-2"
            >
              <span className="text-label-md text-on-surface-variant">
                {row.label}
              </span>
              <span className="text-body-lg text-on-surface">
                {isStale ? "계산 중..." : formatNutritionValue(nutrition[row.key], row.unit)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-md text-on-surface-variant">
          이번 주 끼니에는 영양정보가 있는 레시피가 없어서 합계를 못 냈어요.
        </p>
      )}

      <p className="px-1 text-label-sm text-on-surface-variant">
        일주일 합계예요. 권장량과 비교하거나 목표를 정해드리진 않아요.
      </p>
    </Card>
  );
}
