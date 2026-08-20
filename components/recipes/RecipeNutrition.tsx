import type { RecipeDetailResponse } from "@/types/api";

const ROWS = [
  { key: "calories", label: "칼로리", unit: "kcal" },
  { key: "carbohydrate", label: "탄수화물", unit: "g" },
  { key: "protein", label: "단백질", unit: "g" },
  { key: "fat", label: "지방", unit: "g" },
  { key: "sodium", label: "나트륨", unit: "mg" },
] as const;

/** 1인분 기준 영양정보. 값이 없는 항목은 "-"로 두고 자리는 지킨다. */
export function RecipeNutrition({
  nutrition,
}: {
  nutrition: RecipeDetailResponse["nutrition"];
}) {
  const hasAny = ROWS.some((row) => nutrition[row.key] !== null);
  if (!hasAny) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-headline-md text-on-surface">영양정보</h2>
      <ul className="grid grid-cols-2 gap-2">
        {ROWS.map((row) => {
          const value = nutrition[row.key];
          return (
            <li
              key={row.key}
              className="flex min-h-12 flex-col justify-center rounded-xl bg-surface-container-low px-3 py-2"
            >
              <span className="text-label-md text-on-surface-variant">
                {row.label}
              </span>
              <span className="text-body-lg text-on-surface">
                {value === null ? "-" : `${value}${row.unit}`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-label-sm text-on-surface-variant">
        1인분 기준이에요.
      </p>
    </section>
  );
}
