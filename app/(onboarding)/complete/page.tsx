import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

// 첫 동기화 결과를 그대로 보여준다. /syncing 이 넘겨준 숫자가 없으면
// (직접 URL로 들어온 경우) 숫자 없는 기본 문구로 떨어진다.
function parseCount(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string; mails?: string }>;
}) {
  const params = await searchParams;
  const items = parseCount(params.items);
  const mails = parseCount(params.mails);

  const gotItems = items !== null && items > 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <span className="text-6xl">{gotItems ? "🎉" : "🧺"}</span>

      <p className="text-headline-lg text-on-surface">
        {gotItems ? "우리집 재고가 다 모였어요!" : "연결이 끝났어요!"}
      </p>

      <p className="max-w-xs text-body-md text-on-surface-variant">
        {gotItems
          ? "이제 오래 둔 재료부터 챙겨 먹을 수 있게 알려드릴게요."
          : "최근 주문내역에서는 담을 재료를 찾지 못했어요. 다음에 장을 보면 자동으로 채워드릴게요."}
      </p>

      {items !== null && mails !== null && (
        <Card className="flex w-full max-w-xs items-center justify-around gap-4 p-4">
          <span className="flex flex-col gap-1">
            <span className="text-headline-md text-primary">{mails}</span>
            <span className="text-label-md text-on-surface-variant">
              확인한 메일
            </span>
          </span>
          <span className="h-10 w-px bg-outline-variant" aria-hidden />
          <span className="flex flex-col gap-1">
            <span className="text-headline-md text-primary">{items}</span>
            <span className="text-label-md text-on-surface-variant">
              담은 재료
            </span>
          </span>
        </Card>
      )}

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Link href="/inventory" className="w-full">
          <Button className="w-full">재고 보러 가기</Button>
        </Link>
        <Link href="/home" className="w-full">
          <Button variant="ghost" className="w-full">
            홈으로 가기
          </Button>
        </Link>
      </div>
    </div>
  );
}
