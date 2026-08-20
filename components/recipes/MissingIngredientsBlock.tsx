import { Button } from "@/components/ui/Button";
import { IngredientIcon } from "@/components/ui/IngredientIcon";

/**
 * FR-08-02 부족 재료 + 쇼핑 CTA 자리.
 *
 * 실제 쿠팡·네이버쇼핑 딥링크는 Phase 4(FR-18)라 아직 갈 곳이 없다. 눌리는
 * 링크를 놔두면 "눌러도 아무 일 없는 앱"이 되므로, 버튼은 잠가두고 무엇이
 * 준비 중인지 문장으로 말해준다.
 */
export function MissingIngredientsBlock({
  missing,
}: {
  missing: string[];
}) {
  if (missing.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-headline-md text-on-surface">
        부족한 재료 {missing.length}개
      </h2>
      <ul className="flex flex-wrap gap-2">
        {missing.map((name) => (
          <li
            key={name}
            className="flex min-h-12 items-center gap-2 rounded-xl bg-error-container px-3 py-2 text-body-lg text-on-error-container"
          >
            <IngredientIcon
              normalizedName={name}
              size="sm"
              className="bg-surface-container-lowest"
            />
            {name}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 rounded-xl bg-surface-container-low p-4">
        <p className="text-body-md text-on-surface-variant">
          이 재료들은 장보기 탭에 모아뒀다가 한 번에 담을 수 있게 준비하고
          있어요. 지금은 목록만 알려드릴게요.
        </p>
        <Button
          variant="secondary"
          disabled
          className="w-full"
          aria-label="장보기 연결 준비 중"
        >
          장보기 연결 준비 중
        </Button>
      </div>
    </section>
  );
}
