import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/inventory/service-client";
import { runHouseholdSync } from "@/lib/inventory/sync";

// Vercel Cron이 GET으로 때린다. 캐시되면 크론이 아무 일도 안 하게 되므로
// 매번 실행되도록 못 박는다.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/sync-mail — 하루 한 번 도는 자동 동기화(FR-02-01).
 * 스케줄은 vercel.json에 있다.
 *
 * 인터넷에서 아무나 못 부르도록 CRON_SECRET을 확인한다. Vercel Cron은
 * Authorization: Bearer $CRON_SECRET 헤더를 붙여 호출한다.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 활성 메일 연결이 하나라도 있는 가구만 돈다.
  const { data: connections, error } = await supabase
    .from("mail_connection")
    .select("household_id")
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const householdIds = [
    ...new Set((connections ?? []).map((row) => row.household_id)),
  ];

  let processedMailCount = 0;
  let addedItemCount = 0;
  const failedHouseholds: { householdId: string; error: string }[] = [];

  // 가구 하나가 실패해도 나머지는 계속 돈다.
  for (const householdId of householdIds) {
    try {
      const result = await runHouseholdSync(supabase, householdId);
      processedMailCount += result.processedMailCount;
      addedItemCount += result.addedItemCount;

      for (const connection of result.connections) {
        if (connection.status === "failed") {
          failedHouseholds.push({
            householdId,
            error: `${connection.emailAddress}: ${connection.error ?? "unknown"}`,
          });
        }
      }
    } catch (syncError) {
      failedHouseholds.push({
        householdId,
        error:
          syncError instanceof Error ? syncError.message : String(syncError),
      });
    }
  }

  return NextResponse.json({
    householdCount: householdIds.length,
    processedMailCount,
    addedItemCount,
    failures: failedHouseholds,
  });
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  // 시크릿이 없으면 열어두지 않고 잠근다 — 설정 누락이 공개 엔드포인트가
  // 되는 것보다는 크론이 안 도는 편이 낫다.
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
