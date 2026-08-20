import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function CompletePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <span className="text-6xl">🎉</span>
      <p className="text-headline-lg text-on-surface">
        우리집 재고가 다 모였어요!
      </p>
      <p className="text-body-md text-on-surface-variant max-w-xs">
        이제 소진임박 재료부터 챙겨 먹을 수 있게 알려드릴게요.
      </p>
      <Link href="/home" className="w-full max-w-xs">
        <Button className="w-full">시작하기</Button>
      </Link>
    </div>
  );
}
