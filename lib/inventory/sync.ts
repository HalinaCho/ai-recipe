import { getEffectiveSenderDomains } from "@/lib/inventory/sender-domains";
import { inferStorageType } from "@/lib/inventory/storage";
import type { ServerSupabaseClient } from "@/lib/inventory/types";
import { decryptSecret } from "@/lib/crypto";
import { createMailAdapter } from "@/lib/mail-adapters";
import type { MailAdapter, RawMailMessage } from "@/lib/mail-adapters/types";
import { parseOrderMail } from "@/lib/parsing/order-mail-parser";
import type { ParsedOrderMail } from "@/lib/parsing/types";
import type { SyncResponse } from "@/types/api";
import type { Database } from "@/types/database";

type MailConnectionRow =
  Database["public"]["Tables"]["mail_connection"]["Row"];

/** 첫 동기화에서 거슬러 올라갈 기간. 이후로는 last_synced_at부터. */
const INITIAL_LOOKBACK_DAYS = 30;

/** 한 연결당 한 번에 처리할 메일 상한 — 크론 실행 시간을 묶어 둔다. */
const DEFAULT_MAX_RESULTS = 50;

/**
 * 발신자가 등록된 쇼핑몰 도메인인지 다시 확인한다.
 *
 * 어댑터가 이미 걸러서 주지만, 여기서 한 번 더 본다. 사용자의 메일함에는
 * 사적인 편지가 들어 있고 다음 줄에서 그 본문을 외부 LLM으로 보내므로,
 * 어댑터의 필터가 언젠가 잘못 고쳐졌을 때 그 결과가 곧바로 개인정보 유출이
 * 되어서는 안 된다. 이 검사는 그 경우에도 LLM 호출을 막는 마지막 방어선이다
 * (NFR-01·NFR-02).
 */
function isFromRegisteredSender(
  mail: RawMailMessage,
  senderDomains: string[],
): boolean {
  // "쿠팡" <noreply@e.coupang.com> 형태에서 주소만 뽑는다.
  const address = (mail.from.match(/<([^>]+)>/)?.[1] ?? mail.from)
    .trim()
    .toLowerCase();
  const domain = address.split("@")[1];
  if (!domain) return false;

  // 서브도메인은 허용하되(e.coupang.com), 접미사만 같은 남의 도메인은
  // 막는다(notcoupang.com).
  return senderDomains.some((registered) => {
    const target = registered.trim().toLowerCase();
    return domain === target || domain.endsWith(`.${target}`);
  });
}

/** 테스트에서 어댑터와 파서를 갈아 끼우기 위한 이음새. */
export interface SyncDeps {
  createAdapter?: typeof createMailAdapter;
  parseMail?: (mail: RawMailMessage) => Promise<ParsedOrderMail>;
}

export interface SyncOptions {
  maxResultsPerConnection?: number;
  deps?: SyncDeps;
}

/**
 * 가구 하나의 메일함들을 훑어 재고를 채운다.
 *
 * 연결 하나가 죽어도 나머지는 계속 돈다 — 결과는 connections[]에 연결별로 담긴다.
 * 같은 상품을 구성원 둘이 따로 샀다면 그건 진짜 두 번의 구매다(PRD §2.2).
 * 유일한 중복 제거는 메일 고유 ID 멱등성(FR-02-03)뿐이다.
 */
export async function runHouseholdSync(
  supabase: ServerSupabaseClient,
  householdId: string,
  options: SyncOptions = {},
): Promise<SyncResponse> {
  const createAdapter = options.deps?.createAdapter ?? createMailAdapter;
  const parseMail = options.deps?.parseMail ?? parseOrderMail;
  const maxResults = options.maxResultsPerConnection ?? DEFAULT_MAX_RESULTS;

  const result: SyncResponse = {
    processedMailCount: 0,
    addedItemCount: 0,
    connections: [],
  };

  const { data: connections, error: connectionsError } = await supabase
    .from("mail_connection")
    .select()
    .eq("household_id", householdId)
    .eq("status", "active");

  if (connectionsError) throw new Error(connectionsError.message);
  if (!connections?.length) return result;

  const senderDomains = await getEffectiveSenderDomains(supabase, householdId);

  // 연결을 순차로 도는 이유: 메일 한 통마다 LLM 호출이 하나씩 붙어서,
  // 병렬로 풀면 레이트리밋에 먼저 걸린다.
  for (const connection of connections) {
    try {
      const perConnection = await syncOneConnection({
        supabase,
        householdId,
        connection,
        senderDomains,
        maxResults,
        createAdapter,
        parseMail,
      });

      result.processedMailCount += perConnection.processedMailCount;
      result.addedItemCount += perConnection.addedItemCount;
      result.connections.push({
        mailConnectionId: connection.id,
        emailAddress: connection.email_address,
        status: "success",
      });
    } catch (error) {
      result.connections.push({
        mailConnectionId: connection.id,
        emailAddress: connection.email_address,
        status: "failed",
        error: toMessage(error),
      });
    }
  }

  return result;
}

async function syncOneConnection(args: {
  supabase: ServerSupabaseClient;
  householdId: string;
  connection: MailConnectionRow;
  senderDomains: string[];
  maxResults: number;
  createAdapter: typeof createMailAdapter;
  parseMail: (mail: RawMailMessage) => Promise<ParsedOrderMail>;
}): Promise<{ processedMailCount: number; addedItemCount: number }> {
  const {
    supabase,
    householdId,
    connection,
    senderDomains,
    maxResults,
    createAdapter,
    parseMail,
  } = args;

  const adapter: MailAdapter = createAdapter({
    provider: connection.provider,
    emailAddress: connection.email_address,
    secret: decryptSecret(connection.encrypted_secret),
  });

  const mails = await adapter.fetchOrderMails({
    senderDomains,
    since: connection.last_synced_at
      ? connection.last_synced_at.slice(0, 10)
      : daysAgo(INITIAL_LOOKBACK_DAYS),
    maxResults,
  });

  const unseen = await filterUnprocessed(supabase, connection.id, mails);

  let processedMailCount = 0;
  let addedItemCount = 0;

  for (const mail of unseen) {
    // LLM 호출 직전 마지막 확인. 처리 완료로 남기지 않고 그냥 건너뛴다 —
    // 다음 동기화에서 다시 걸러질 뿐 본문이 나갈 일은 없다.
    if (!isFromRegisteredSender(mail, senderDomains)) {
      console.warn(
        `[sync] 등록되지 않은 발신자의 메일을 건너뜁니다 (connection=${connection.id})`,
      );
      continue;
    }

    // 파싱 실패가 인프라 문제라면 parseOrderMail이 던진다 — 그때는 이 메일을
    // 처리 완료로 남기지 않고 다음 동기화 때 다시 시도한다.
    const parsed = await parseMail(mail);

    // 재고 행보다 처리 기록을 먼저 남긴다. unique(mail_connection_id,
    // provider_message_id)가 원자적 선점 역할을 해서, 크론이 겹쳐 돌거나
    // 중간에 죽어도 같은 메일이 재고에 두 번 반영되는 일은 없다.
    const claimed = await claimMail(
      supabase,
      connection.id,
      mail.providerMessageId,
      parsed.status,
    );
    if (!claimed) continue;

    processedMailCount += 1;
    if (parsed.items.length === 0) continue;

    const { error: insertError } = await supabase.from("inventory_item").insert(
      parsed.items.map((item) => ({
        household_id: householdId,
        normalized_name: item.normalizedName,
        raw_name: item.rawName,
        quantity: item.quantity,
        purchased_at: parsed.purchasedAt,
        // FR-04-04: 상품명에 (냉장)/(냉동) 표기가 있으면 그걸 쓰고,
        // 없으면 재료명으로 추정한다. 틀릴 수 있어 사용자가 고칠 수 있다.
        storage_type: inferStorageType(item.rawName, item.normalizedName),
        source_mail_connection_id: connection.id,
      })),
    );

    if (insertError) throw new Error(insertError.message);
    addedItemCount += parsed.items.length;
  }

  const { error: touchError } = await supabase
    .from("mail_connection")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", connection.id);

  if (touchError) throw new Error(touchError.message);

  return { processedMailCount, addedItemCount };
}

/** FR-02-03: 이미 처리한 메일 ID는 건너뛴다. */
async function filterUnprocessed(
  supabase: ServerSupabaseClient,
  mailConnectionId: string,
  mails: RawMailMessage[],
): Promise<RawMailMessage[]> {
  if (mails.length === 0) return [];

  const { data, error } = await supabase
    .from("processed_mail_record")
    .select("provider_message_id")
    .eq("mail_connection_id", mailConnectionId)
    .in(
      "provider_message_id",
      mails.map((mail) => mail.providerMessageId),
    );

  if (error) throw new Error(error.message);

  const seen = new Set((data ?? []).map((row) => row.provider_message_id));
  return mails.filter((mail) => !seen.has(mail.providerMessageId));
}

/**
 * 처리 기록을 선점한다. unique 제약에 걸리면(동시 실행이 먼저 잡았다는 뜻)
 * false를 돌려주고, 호출측은 이 메일을 조용히 건너뛴다.
 */
async function claimMail(
  supabase: ServerSupabaseClient,
  mailConnectionId: string,
  providerMessageId: string,
  extractionStatus: ParsedOrderMail["status"],
): Promise<boolean> {
  const { error } = await supabase.from("processed_mail_record").insert({
    mail_connection_id: mailConnectionId,
    provider_message_id: providerMessageId,
    extraction_status: extractionStatus,
  });

  if (!error) return true;
  if (isUniqueViolation(error)) return false;
  throw new Error(error.message);
}

function isUniqueViolation(error: { code?: string | null }): boolean {
  return error.code === "23505";
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
