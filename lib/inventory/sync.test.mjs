// 실행: node --test lib/inventory/sync.test.mjs
//
// 가짜 메일 어댑터 + 인메모리 Supabase로 동기화 파이프라인을 돌린다.
// 실제 메일함도, Claude 호출도 필요 없다.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// 번들러가 해주던 두 가지를 테스트 러너에서 대신한다: tsconfig의 "@/*" 별칭과
// 확장자 없는 상대 경로. 정적 import는 훅이 돌기 전에 해석되므로, 대상
// 모듈은 아래에서 동적으로 불러온다.
const projectRoot = path.resolve(import.meta.dirname, "../..");

function resolveSource(specifier, parentURL) {
  let base;
  if (specifier.startsWith("@/")) {
    base = path.join(projectRoot, specifier.slice(2));
  } else if (specifier.startsWith(".") && parentURL) {
    base = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  } else {
    return null;
  }

  if (path.extname(base)) return existsSync(base) ? base : null;
  return (
    [`${base}.ts`, path.join(base, "index.ts")].find((candidate) =>
      existsSync(candidate),
    ) ?? null
  );
}

registerHooks({
  resolve(specifier, context, next) {
    const resolved = resolveSource(specifier, context.parentURL);
    return resolved
      ? next(pathToFileURL(resolved).href, context)
      : next(specifier, context);
  },
});

// lib/crypto가 요구하는 32바이트 키. 파이프라인이 실제로 복호화를 거치는지도
// 함께 확인하려고 진짜 암호문을 넣는다.
process.env.MAIL_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const { encryptSecret } = await import("@/lib/crypto.ts");
const { runHouseholdSync } = await import("@/lib/inventory/sync.ts");

const HOUSEHOLD = "household-1";
const APP_PASSWORD = "naver-app-password";

// ---------------------------------------------------------------------------
// 인메모리 Supabase — sync.ts가 실제로 쓰는 체인만 흉내 낸다.
// ---------------------------------------------------------------------------

function createFakeSupabase(seed = {}) {
  const db = {
    mail_connection: [],
    shopping_sender_domain: [],
    processed_mail_record: [],
    inventory_item: [],
    ...seed,
  };

  let autoId = 0;

  function matches(row, filters) {
    return filters.every(([column, value]) => row[column] === value);
  }

  function run(state) {
    const rows = db[state.table];

    if (state.op === "select") {
      let selected = rows.filter((row) => matches(row, state.filters));
      if (state.inFilter) {
        const [column, values] = state.inFilter;
        selected = selected.filter((row) => values.includes(row[column]));
      }
      return { data: selected.map((row) => ({ ...row })), error: null };
    }

    if (state.op === "insert") {
      const payload = Array.isArray(state.payload)
        ? state.payload
        : [state.payload];

      if (state.table === "processed_mail_record") {
        for (const record of payload) {
          const duplicate = rows.some(
            (row) =>
              row.mail_connection_id === record.mail_connection_id &&
              row.provider_message_id === record.provider_message_id,
          );
          // unique (mail_connection_id, provider_message_id)
          if (duplicate) {
            return {
              data: null,
              error: { code: "23505", message: "duplicate key value" },
            };
          }
        }
      }

      for (const record of payload) {
        rows.push({ id: `row-${(autoId += 1)}`, ...record });
      }
      return { data: null, error: null };
    }

    if (state.op === "update") {
      for (const row of rows) {
        if (matches(row, state.filters)) Object.assign(row, state.payload);
      }
      return { data: null, error: null };
    }

    throw new Error(`unsupported op: ${state.op}`);
  }

  function from(table) {
    const state = { table, op: "select", filters: [], inFilter: null, payload: null };
    const builder = {
      select: () => builder,
      order: () => builder,
      eq(column, value) {
        state.filters.push([column, value]);
        return builder;
      },
      in(column, values) {
        state.inFilter = [column, values];
        return builder;
      },
      insert(payload) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      then(resolve, reject) {
        try {
          resolve(run(state));
        } catch (error) {
          reject(error);
        }
      },
    };
    return builder;
  }

  return { db, from };
}

function connectionRow(id, emailAddress) {
  return {
    id,
    household_id: HOUSEHOLD,
    connected_by_member_id: "member-1",
    provider: "naver",
    email_address: emailAddress,
    auth_type: "imap_app_password",
    encrypted_secret: encryptSecret(APP_PASSWORD),
    last_synced_at: null,
    status: "active",
    created_at: "2026-08-01T00:00:00.000Z",
  };
}

function mail(providerMessageId, subject) {
  return {
    providerMessageId,
    from: "no-reply@coupang.com",
    subject,
    receivedAt: "2026-08-13T12:00:00.000Z",
    bodyText: "본문은 메모리에만 있고 저장되지 않는다",
  };
}

/** 항상 같은 결과를 내는 가짜 파서 — LLM 호출 없이 파이프라인만 본다. */
function fakeParser(itemsByMessageId) {
  return async (message) => {
    const items = itemsByMessageId[message.providerMessageId] ?? [];
    return {
      purchasedAt: "2026-08-13",
      items,
      status: items.length ? "success" : "failed",
    };
  };
}

function fakeAdapterFactory(mailsByEmail, onCredentials = () => {}) {
  return (credentials) => {
    onCredentials(credentials);
    return {
      provider: credentials.provider,
      async fetchOrderMails() {
        return mailsByEmail[credentials.emailAddress] ?? [];
      },
      async fetchMessageById() {
        return null;
      },
      async verifyConnection() {
        return { ok: true, emailAddress: credentials.emailAddress };
      },
    };
  };
}

const MILK = [{ rawName: "서울우유 900ml", normalizedName: "우유", quantity: "900ml" }];
const TOFU_AND_PA = [
  { rawName: "풀무원 부침두부 300g", normalizedName: "두부", quantity: "1모" },
  { rawName: "흙대파 1단", normalizedName: "대파", quantity: "1단" },
];

// ---------------------------------------------------------------------------

test("동기화를 두 번 돌려도 같은 메일이 재고에 두 번 들어가지 않는다", async () => {
  const supabase = createFakeSupabase({
    mail_connection: [connectionRow("conn-1", "a@naver.com")],
  });

  const deps = {
    createAdapter: fakeAdapterFactory({
      "a@naver.com": [mail("msg-1", "주문 완료"), mail("msg-2", "주문 완료")],
    }),
    parseMail: fakeParser({ "msg-1": MILK, "msg-2": TOFU_AND_PA }),
  };

  const first = await runHouseholdSync(supabase, HOUSEHOLD, { deps });
  assert.equal(first.processedMailCount, 2);
  assert.equal(first.addedItemCount, 3);
  assert.equal(supabase.db.inventory_item.length, 3);
  assert.equal(supabase.db.processed_mail_record.length, 2);

  const second = await runHouseholdSync(supabase, HOUSEHOLD, { deps });
  assert.equal(second.processedMailCount, 0, "이미 처리한 메일은 건너뛴다");
  assert.equal(second.addedItemCount, 0);
  assert.equal(
    supabase.db.inventory_item.length,
    3,
    "재고 행이 늘어나면 안 된다 (FR-02-03)",
  );
  assert.equal(supabase.db.processed_mail_record.length, 2);
});

test("구성원 둘이 같은 상품을 따로 사면 둘 다 재고에 남는다 (PRD §2.2)", async () => {
  const supabase = createFakeSupabase({
    mail_connection: [
      connectionRow("conn-1", "a@naver.com"),
      connectionRow("conn-2", "b@naver.com"),
    ],
  });

  const result = await runHouseholdSync(supabase, HOUSEHOLD, {
    deps: {
      createAdapter: fakeAdapterFactory({
        "a@naver.com": [mail("a-1", "주문 완료")],
        "b@naver.com": [mail("b-1", "주문 완료")],
      }),
      parseMail: fakeParser({ "a-1": MILK, "b-1": MILK }),
    },
  });

  assert.equal(result.addedItemCount, 2);
  assert.deepEqual(
    supabase.db.inventory_item.map((row) => row.normalized_name),
    ["우유", "우유"],
  );
});

test("연결 하나가 실패해도 나머지는 계속 돈다", async () => {
  const supabase = createFakeSupabase({
    mail_connection: [
      connectionRow("conn-1", "broken@naver.com"),
      connectionRow("conn-2", "ok@naver.com"),
    ],
  });

  const result = await runHouseholdSync(supabase, HOUSEHOLD, {
    deps: {
      createAdapter: (credentials) => ({
        provider: "naver",
        async fetchOrderMails() {
          if (credentials.emailAddress === "broken@naver.com") {
            throw new Error("IMAP 인증 실패");
          }
          return [mail("ok-1", "주문 완료")];
        },
        async fetchMessageById() {
          return null;
        },
        async verifyConnection() {
          return { ok: true };
        },
      }),
      parseMail: fakeParser({ "ok-1": MILK }),
    },
  });

  assert.equal(result.addedItemCount, 1);
  assert.deepEqual(
    result.connections.map((entry) => [entry.emailAddress, entry.status]),
    [
      ["broken@naver.com", "failed"],
      ["ok@naver.com", "success"],
    ],
  );
  assert.match(result.connections[0].error, /IMAP 인증 실패/);
});

test("어댑터에 복호화된 비밀번호와 기본∪가구 발신 도메인이 전달된다", async () => {
  const supabase = createFakeSupabase({
    mail_connection: [connectionRow("conn-1", "a@naver.com")],
    shopping_sender_domain: [
      { id: "d-1", household_id: HOUSEHOLD, domain: "mymart.co.kr" },
    ],
  });

  let seenCredentials = null;
  let seenDomains = null;

  await runHouseholdSync(supabase, HOUSEHOLD, {
    deps: {
      createAdapter: (credentials) => {
        seenCredentials = credentials;
        return {
          provider: "naver",
          async fetchOrderMails(options) {
            seenDomains = options.senderDomains;
            return [];
          },
          async fetchMessageById() {
            return null;
          },
          async verifyConnection() {
            return { ok: true };
          },
        };
      },
    },
  });

  assert.equal(seenCredentials.secret, APP_PASSWORD);
  assert.ok(seenDomains.includes("coupang.com"), "기본 도메인 포함");
  assert.ok(seenDomains.includes("mymart.co.kr"), "가구가 등록한 도메인 포함");
});

test("품목이 없는 메일도 처리 기록만 남기고 다시 파싱하지 않는다", async () => {
  const supabase = createFakeSupabase({
    mail_connection: [connectionRow("conn-1", "a@naver.com")],
  });

  let parseCalls = 0;
  const deps = {
    createAdapter: fakeAdapterFactory({
      "a@naver.com": [mail("promo-1", "이번 주 특가")],
    }),
    parseMail: async () => {
      parseCalls += 1;
      return { purchasedAt: "2026-08-13", items: [], status: "failed" };
    },
  };

  await runHouseholdSync(supabase, HOUSEHOLD, { deps });
  await runHouseholdSync(supabase, HOUSEHOLD, { deps });

  assert.equal(parseCalls, 1);
  assert.equal(supabase.db.inventory_item.length, 0);
  assert.equal(supabase.db.processed_mail_record[0].extraction_status, "failed");
});

test("last_synced_at이 갱신되어 다음 동기화의 since가 된다", async () => {
  const supabase = createFakeSupabase({
    mail_connection: [connectionRow("conn-1", "a@naver.com")],
  });

  const sinceValues = [];

  await runHouseholdSync(supabase, HOUSEHOLD, {
    deps: {
      createAdapter: () => ({
        provider: "naver",
        async fetchOrderMails(options) {
          sinceValues.push(options.since);
          return [];
        },
        async fetchMessageById() {
          return null;
        },
        async verifyConnection() {
          return { ok: true };
        },
      }),
    },
  });

  assert.match(sinceValues[0], /^\d{4}-\d{2}-\d{2}$/, "첫 동기화는 기본 조회 기간");
  assert.ok(supabase.db.mail_connection[0].last_synced_at);
});
