import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type {
  ConnectionCheckResult,
  MailAdapter,
  MailAdapterCredentials,
  MailFetchOptions,
  RawMailMessage,
} from "./types";

// FR-01-03 / FR-01-06: 네이버메일은 OAuth가 없어 IMAP + 앱 비밀번호로 붙는다.
// `category:purchases` 같은 자동 분류가 없으므로 등록된 쇼핑몰 발신 도메인이
// 1차이자 유일한 필터다 — 전체 편지함을 순회하지 않는다 (NFR-01).

const HOST = "imap.naver.com";
const PORT = 993;
const MAILBOX = "INBOX";

/** 한 번 동기화에서 가져올 상한. 첫 연동 시 편지함 전체를 긁지 않도록. */
const DEFAULT_MAX_RESULTS = 50;

/**
 * 자격증명이 더는 통하지 않는다(앱 비밀번호 만료·삭제, IMAP 사용 해제).
 * 호출측이 mail_connection.status를 "expired"로 바꾸는 신호.
 */
export class NaverAuthError extends Error {
  readonly code = "mail_auth_expired" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "NaverAuthError";
  }
}

export function isNaverAuthError(error: unknown): error is NaverAuthError {
  return error instanceof NaverAuthError;
}

/** IMAP 인증 실패는 서버마다 문구가 달라 코드/메시지를 함께 본다. */
function isAuthFailure(error: unknown): boolean {
  if (!error) return false;
  const candidate = error as { authenticationFailed?: boolean; responseText?: string };
  if (candidate.authenticationFailed) return true;

  const text = `${candidate.responseText ?? ""} ${
    error instanceof Error ? error.message : ""
  }`.toLowerCase();

  return (
    text.includes("authenticationfailed") ||
    text.includes("authentication failed") ||
    text.includes("invalid credentials") ||
    text.includes("login failed")
  );
}

export function createNaverImapAdapter(
  credentials: MailAdapterCredentials,
): MailAdapter {
  /**
   * IMAP은 상태를 가진 연결이라 매번 새로 열고 반드시 닫는다. 연결을
   * 재사용하면 동기화 사이에 끊긴 소켓을 물고 있게 된다.
   */
  async function withMailbox<T>(
    run: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    const client = new ImapFlow({
      host: HOST,
      port: PORT,
      secure: true,
      auth: { user: credentials.emailAddress, pass: credentials.secret },
      // 기본 로거는 메일 제목·주소를 stdout으로 쏟아낸다 (NFR-02 취지에 반함).
      logger: false,
    });

    try {
      await client.connect();
    } catch (error) {
      if (isAuthFailure(error)) {
        throw new NaverAuthError(
          "네이버메일 인증에 실패했습니다 — 앱 비밀번호를 다시 확인해 주세요",
          { cause: error },
        );
      }
      throw error;
    }

    const lock = await client.getMailboxLock(MAILBOX);
    try {
      return await run(client);
    } finally {
      lock.release();
      await client.logout().catch(() => {
        // 이미 끊긴 연결을 닫으려다 나는 오류는 결과에 영향이 없다.
      });
    }
  }

  /**
   * 발신 도메인 목록을 OR로 묶은 IMAP SEARCH 조건. 빈 목록은
   * "전부 가져와"가 아니라 버그다 — 무필터 조회를 막는다 (NFR-01).
   */
  function buildSearchQuery(options: MailFetchOptions) {
    const domains = options.senderDomains
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);

    if (domains.length === 0) {
      throw new Error(
        "senderDomains is empty — refusing to search an unfiltered mailbox (NFR-01)",
      );
    }

    const since = options.since ? new Date(options.since) : undefined;
    const base = since && !Number.isNaN(since.getTime()) ? { since } : {};

    // FROM 하나면 OR로 감쌀 필요가 없다 (서버에 따라 or:[단일]을 싫어함).
    return domains.length === 1
      ? { ...base, from: domains[0] }
      : { ...base, or: domains.map((domain) => ({ from: domain })) };
  }

  async function toRawMessage(
    source: Buffer,
    uid: number,
  ): Promise<RawMailMessage> {
    const parsed = await simpleParser(source);

    // 주문 메일은 대부분 HTML만 있고, mailparser가 text 대체본을 만들어 준다.
    const bodyText = (parsed.text ?? parsed.html ?? "").toString().trim();

    return {
      providerMessageId: String(uid), // FR-02-03 멱등성 키 (IMAP UID)
      from: parsed.from?.text ?? "",
      subject: parsed.subject ?? "",
      receivedAt: (parsed.date ?? new Date()).toISOString(),
      bodyText,
    };
  }

  return {
    provider: "naver",

    async fetchOrderMails(
      options: MailFetchOptions,
    ): Promise<RawMailMessage[]> {
      const query = buildSearchQuery(options);
      const limit = options.maxResults ?? DEFAULT_MAX_RESULTS;

      return withMailbox(async (client) => {
        const uids = await client.search(query, { uid: true });
        if (!uids || uids.length === 0) return [];

        // 최신 것부터 상한만큼. UID는 증가하므로 큰 쪽이 최신이다.
        const selected = uids.slice(-limit).reverse();

        const messages: RawMailMessage[] = [];
        for (const uid of selected) {
          const message = await client.fetchOne(
            String(uid),
            { source: true },
            { uid: true },
          );
          if (!message || !message.source) continue;
          messages.push(await toRawMessage(message.source, uid));
        }
        return messages;
      });
    },

    async fetchMessageById(
      providerMessageId: string,
    ): Promise<RawMailMessage | null> {
      // FR-03-04: 사본을 두지 않으므로 재처리는 원본 메일함에서 다시 읽는다.
      const uid = Number(providerMessageId);
      if (!Number.isInteger(uid)) return null;

      return withMailbox(async (client) => {
        const message = await client.fetchOne(
          String(uid),
          { source: true },
          { uid: true },
        );
        if (!message || !message.source) return null;
        return toRawMessage(message.source, uid);
      });
    },

    async verifyConnection(): Promise<ConnectionCheckResult> {
      try {
        await withMailbox(async () => undefined);
        return { ok: true, emailAddress: credentials.emailAddress };
      } catch (error) {
        return {
          ok: false,
          error: isNaverAuthError(error)
            ? error.message
            : error instanceof Error
              ? error.message
              : "네이버메일 연결 확인에 실패했습니다",
        };
      }
    },
  };
}
