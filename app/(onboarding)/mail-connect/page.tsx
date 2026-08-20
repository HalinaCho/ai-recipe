import Link from "next/link";
import { Card } from "@/components/ui/Card";

export default function MailConnectPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="space-y-2">
        <p className="text-headline-lg text-on-surface">
          어떤 메일함을 쓰세요?
        </p>
        <p className="text-body-md text-on-surface-variant">
          주문내역 메일이 오는 메일함을 읽기 전용으로 연결해요. 여러 개
          연결할 수 있어요.
        </p>
      </div>
      <Link href="/mail-connect/gmail">
        <Card className="flex items-center gap-4 active:translate-y-0.5 transition-transform">
          <span className="material-symbols-outlined text-3xl text-primary">
            mail
          </span>
          <div>
            <p className="text-body-lg text-on-surface">Gmail</p>
            <p className="text-body-md text-on-surface-variant">
              구글 계정으로 바로 연결
            </p>
          </div>
        </Card>
      </Link>
      <Link href="/mail-connect/naver">
        <Card className="flex items-center gap-4 active:translate-y-0.5 transition-transform">
          <span className="material-symbols-outlined text-3xl text-secondary">
            mail
          </span>
          <div>
            <p className="text-body-lg text-on-surface">네이버메일</p>
            <p className="text-body-md text-on-surface-variant">
              단계별 가이드를 보며 연결
            </p>
          </div>
        </Card>
      </Link>
    </div>
  );
}
