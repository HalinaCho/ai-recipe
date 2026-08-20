import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function SplashPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <div className="space-y-2">
        <p className="text-display-lg text-primary">냉파고</p>
        <p className="text-body-lg text-on-surface-variant">
          장 본 걸 잊지 않는 우리집 냉장고
        </p>
      </div>
      <Link href="/login" className="w-full max-w-xs">
        <Button className="w-full">시작하기</Button>
      </Link>
    </div>
  );
}
