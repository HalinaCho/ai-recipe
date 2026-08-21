import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { createMailAdapter } from "@/lib/mail-adapters";
import { createClient } from "@/lib/supabase/server";
import type {
  CreateMailConnectionResponse,
  CreateNaverMailConnectionRequest,
  MailConnectionSummary,
  MailConnectionsResponse,
} from "@/types/api";
import type { Database } from "@/types/database";

type MailConnectionRow =
  Database["public"]["Tables"]["mail_connection"]["Row"];

function toSummary(row: MailConnectionRow): MailConnectionSummary {
  return {
    id: row.id,
    provider: row.provider,
    emailAddress: row.email_address,
    lastSyncedAt: row.last_synced_at,
    status: row.status,
  };
}

/** GET /api/mail-connections — 설정 화면의 연결된 메일 계정 목록. */
export async function GET() {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("mail_connection")
    .select()
    .eq("household_id", context.householdId)
    // 해제한 계정은 재고 출처 추적을 위해 행만 남겨두고 목록에서는 감춘다.
    .neq("status", "revoked")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response: MailConnectionsResponse = {
    connections: (data ?? []).map(toSummary),
  };
  return NextResponse.json(response);
}

/**
 * POST /api/mail-connections — 네이버메일 전용(FR-01-03).
 * Gmail은 OAuth 콜백(app/auth/gmail/callback)에서 만들어진다.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "로그인이 풀렸어요. 다시 로그인해주세요." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | CreateNaverMailConnectionRequest
    | null;

  const emailAddress = body?.emailAddress?.trim().toLowerCase() ?? "";
  const appPassword = body?.appPassword ?? "";

  if (!emailAddress || !appPassword.trim()) {
    return NextResponse.json(
      { error: "네이버 메일 주소와 앱 비밀번호를 모두 입력해 주세요" },
      { status: 400 },
    );
  }

  // 자격증명을 저장하기 전에 실제로 붙는지 본다 — 온보딩에서 오타를
  // 첫 동기화까지 끌고 가지 않기 위해.
  try {
    const check = await createMailAdapter({
      provider: "naver",
      emailAddress,
      secret: appPassword,
    }).verifyConnection();

    if (!check.ok) {
      return NextResponse.json(
        { error: check.error ?? "네이버메일에 연결하지 못했습니다" },
        { status: 400 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "네이버메일에 연결하지 못했습니다",
      },
      { status: 400 },
    );
  }

  // 같은 메일함을 다시 연결하는 건 앱 비밀번호를 갱신하겠다는 뜻이다.
  // 일반 insert면 마이그레이션 0004의 유니크 제약에 걸려 500이 난다.
  const { data, error } = await supabase
    .from("mail_connection")
    .upsert(
      {
        household_id: context.householdId,
        connected_by_member_id: context.memberId,
        provider: "naver",
        email_address: emailAddress,
        auth_type: "imap_app_password",
        // NFR-03: 앱 비밀번호는 평문으로 남지 않는다.
        encrypted_secret: encryptSecret(appPassword),
        status: "active",
      },
      { onConflict: "household_id,provider,email_address" },
    )
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "메일 계정을 저장하지 못했습니다" },
      { status: 500 },
    );
  }

  const response: CreateMailConnectionResponse = {
    connection: toSummary(data),
  };
  return NextResponse.json(response, { status: 201 });
}
