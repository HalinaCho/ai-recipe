import { TopAppBar } from "@/components/ui/TopAppBar";
import { Card } from "@/components/ui/Card";

// M0 shell — 발신 도메인 관리(FR-01-05/06 필터 대상)는 M1에서 구현.
export default function ShoppingDomainsSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <TopAppBar title="등록 쇼핑몰 발신 도메인" />
      <div className="px-container-padding">
        <Card>
          <p className="text-body-md text-on-surface-variant">
            쿠팡, 네이버페이 등 발신 도메인을 여기서 관리해요.
          </p>
        </Card>
      </div>
    </div>
  );
}
