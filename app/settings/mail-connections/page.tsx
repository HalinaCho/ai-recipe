import { TopAppBar } from "@/components/ui/TopAppBar";
import { Card } from "@/components/ui/Card";

// M0 shell — mail_connection CRUD UI ships alongside M1's real adapters.
export default function MailConnectionsSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <TopAppBar title="연결된 메일 계정" />
      <div className="px-container-padding">
        <Card>
          <p className="text-body-md text-on-surface-variant">
            아직 연결된 메일 계정이 없어요.
          </p>
        </Card>
      </div>
    </div>
  );
}
