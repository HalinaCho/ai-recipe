export default function SyncingPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div className="h-16 w-16 rounded-full border-4 border-primary-container border-t-primary animate-spin" />
      <p className="text-headline-md text-on-surface">
        주문내역을 불러오는 중이에요
      </p>
      <p className="text-body-md text-on-surface-variant max-w-xs">
        메일함에서 최근 주문내역을 찾아 재고로 정리하고 있어요. 잠시만
        기다려주세요.
      </p>
    </div>
  );
}
