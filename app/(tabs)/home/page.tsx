import { TopAppBar } from "@/components/ui/TopAppBar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

// M0 shell — 소진임박 요약(M1)과 오늘의 추천 레시피(M2)는 이후 단계에서 채운다.
export default function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      <TopAppBar
        title="냉파고"
        action={
          <Button variant="ghost" className="px-3 min-h-10">
            <span className="material-symbols-outlined text-xl">sync</span>
          </Button>
        }
      />
      <div className="px-container-padding flex flex-col gap-4">
        <Card>
          <p className="text-label-md text-on-surface-variant mb-1">
            소진임박 재료
          </p>
          <p className="text-body-md text-on-surface-variant">
            메일 연동이 완료되면 여기에 표시돼요.
          </p>
        </Card>
        <Card>
          <p className="text-label-md text-on-surface-variant mb-1">
            오늘의 추천 레시피
          </p>
          <p className="text-body-md text-on-surface-variant">
            재고가 쌓이면 매칭률 높은 레시피를 추천해드려요.
          </p>
        </Card>
      </div>
    </div>
  );
}
