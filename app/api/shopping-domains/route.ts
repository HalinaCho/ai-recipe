import { NextResponse } from "next/server";
import { getHouseholdContext } from "@/lib/inventory/household-context";
import { isValidDomain, normalizeDomain } from "@/lib/inventory/sender-domains";
import { DEFAULT_SENDER_DOMAINS } from "@/lib/mail-adapters/sender-domains";
import { createClient } from "@/lib/supabase/server";
import type {
  AddShoppingSenderDomainRequest,
  ShoppingSenderDomainsResponse,
} from "@/types/api";
import type { ServerSupabaseClient } from "@/lib/inventory/types";

async function loadDomains(
  supabase: ServerSupabaseClient,
  householdId: string,
): Promise<ShoppingSenderDomainsResponse> {
  const { data, error } = await supabase
    .from("shopping_sender_domain")
    .select("id, domain")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return {
    defaults: [...DEFAULT_SENDER_DOMAINS],
    custom: (data ?? []).map((row) => ({ id: row.id, domain: row.domain })),
  };
}

/** GET /api/shopping-domains — 등록 쇼핑몰 발신 도메인 설정 화면. */
export async function GET() {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await loadDomains(supabase, context.householdId));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "발신 도메인을 불러오지 못했습니다",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/shopping-domains — 가구 전용 발신 도메인 추가.
 * 화면이 곧바로 목록을 다시 그릴 수 있도록 갱신된 전체 목록을 돌려준다.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const context = await getHouseholdContext(supabase);

  if (!context) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | AddShoppingSenderDomainRequest
    | null;

  const domain = normalizeDomain(body?.domain ?? "");

  if (!isValidDomain(domain)) {
    return NextResponse.json(
      { error: "example.com 형태의 도메인을 입력해 주세요" },
      { status: 400 },
    );
  }

  if ((DEFAULT_SENDER_DOMAINS as readonly string[]).includes(domain)) {
    return NextResponse.json(
      { error: "이미 기본으로 포함된 도메인입니다" },
      { status: 409 },
    );
  }

  const { error } = await supabase.from("shopping_sender_domain").insert({
    household_id: context.householdId,
    domain,
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "이미 등록된 도메인입니다" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    return NextResponse.json(
      await loadDomains(supabase, context.householdId),
      { status: 201 },
    );
  } catch (loadError) {
    return NextResponse.json(
      {
        error:
          loadError instanceof Error
            ? loadError.message
            : "발신 도메인을 불러오지 못했습니다",
      },
      { status: 500 },
    );
  }
}
