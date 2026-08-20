import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/inventory/service-client";
import { runRecipeIngestion, type IngestOptions } from "@/lib/recipes/ingest/run";

// 수집은 배치라 오래 걸린다. 응답이 캐시되면 같은 결과만 돌려주므로 막는다.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/ingest-recipes — 식약처 레시피 수집 배치(FR-06-01, FR-07-01).
 *
 * 레시피 테이블은 전역 참조 데이터라 서비스 롤로 쓴다. 아무나 부르면
 * LLM 비용이 그대로 나가므로 크론과 같은 CRON_SECRET 베어러 토큰으로 잠근다.
 *
 * 본문(모두 선택):
 *   { offset?, limit?, pageSize?, batchSize?, force? }
 * 중단되면 응답의 nextOffset을 offset으로 넘겨 이어서 돌리면 된다.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const options = await readOptions(request);
  const supabase = createServiceClient();

  try {
    const report = await runRecipeIngestion(supabase, options);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

async function readOptions(request: Request): Promise<IngestOptions> {
  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // 본문 없이 부르는 것도 허용한다 — 전부 기본값으로 돈다.
  }

  return {
    offset: toNumber(body.offset),
    limit: toNumber(body.limit),
    pageSize: toNumber(body.pageSize),
    batchSize: toNumber(body.batchSize),
    force: body.force === true,
  };
}

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  // 시크릿이 없으면 열어두지 않고 잠근다 — 설정 누락이 공개 엔드포인트가
  // 되는 것보다 배치가 안 도는 편이 낫다.
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
