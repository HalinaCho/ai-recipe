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

/**
 * 네이버는 받은편지함에 두지 않고 주문·결제 메일을 "청구·결제" 폴더로
 * 자동 분류한다. INBOX만 보면 정작 필요한 메일을 통째로 놓치므로
 * (실제 계정에서 확인됨) 폴더를 훑되, 아래 성격의 폴더는 건너뛴다:
 * 보낸편지함·임시보관함(내가 쓴 글), 휴지통(사용자가 지운 것),
 * 스팸(주문 메일이 아님). 어차피 발신 도메인으로 걸러 읽으므로
 * 폴더가 늘어난다고 읽는 메일이 늘지는 않는다 (NFR-01).
 */
const SKIP_SPECIAL_USE = new Set(["\\Sent", "\\Drafts", "\\Trash", "\\Junk"]);
const SKIP_PATHS = new Set([
  "Sent Messages",
  "Drafts",
  "Deleted Messages",
  "Junk",
  "Unwanted",
  "보낼편지함",
  "내게쓴메일함",
]);

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
  async function withClient<T>(run: (client: ImapFlow) => Promise<T>): Promise<T> {
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

    try {
      return await run(client);
    } finally {
      await client.logout().catch(() => {
        // 이미 끊긴 연결을 닫으려다 나는 오류는 결과에 영향이 없다.
      });
    }
  }

  /** 주문 메일이 있을 수 있는 폴더 경로들. */
  async function searchableFolders(client: ImapFlow): Promise<string[]> {
    const paths: string[] = [];
    for (const box of await client.list()) {
      if (box.flags?.has("\\Noselect")) continue;
      if (box.specialUse && SKIP_SPECIAL_USE.has(box.specialUse)) continue;
      if (SKIP_PATHS.has(box.path)) continue;
      paths.push(box.path);
    }
    // INBOX를 먼저 봐서, 상한에 걸리더라도 가장 흔한 위치는 놓치지 않는다.
    return paths.sort((a, b) => (a === "INBOX" ? -1 : b === "INBOX" ? 1 : 0));
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

  /**
   * IMAP UID는 폴더 안에서만 유일하다. 여러 폴더를 훑으므로 폴더 경로를
   * 함께 키에 넣지 않으면 서로 다른 메일이 같은 ID로 보여 멱등성 처리가
   * 엉뚱한 메일을 건너뛰게 된다 (FR-02-03).
   */
  function messageId(folder: string, uid: number): string {
    return `${folder}:${uid}`;
  }

  function parseMessageId(
    id: string,
  ): { folder: string; uid: number } | null {
    const separator = id.lastIndexOf(":");
    if (separator <= 0) return null;
    const uid = Number(id.slice(separator + 1));
    if (!Number.isInteger(uid)) return null;
    return { folder: id.slice(0, separator), uid };
  }

  async function toRawMessage(
    source: Buffer,
    uid: number,
    folder: string,
  ): Promise<RawMailMessage> {
    const parsed = await simpleParser(source);

    // 주문 메일은 대부분 HTML만 있고, mailparser가 text 대체본을 만들어 준다.
    const bodyText = (parsed.text ?? parsed.html ?? "").toString().trim();

    return {
      providerMessageId: messageId(folder, uid),
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

      return withClient(async (client) => {
        const messages: RawMailMessage[] = [];

        for (const folder of await searchableFolders(client)) {
          if (messages.length >= limit) break;

          const lock = await client.getMailboxLock(folder);
          try {
            const uids = await client.search(query, { uid: true });
            if (!uids || uids.length === 0) continue;

            // 최신 것부터. UID는 증가하므로 큰 쪽이 최신이다.
            const selected = uids
              .slice(-(limit - messages.length))
              .reverse();

            for (const uid of selected) {
              const message = await client.fetchOne(
                String(uid),
                { source: true },
                { uid: true },
              );
              if (!message || !message.source) continue;
              messages.push(await toRawMessage(message.source, uid, folder));
            }
          } finally {
            lock.release();
          }
        }

        return messages;
      });
    },

    async fetchMessageById(
      providerMessageId: string,
    ): Promise<RawMailMessage | null> {
      // FR-03-04: 사본을 두지 않으므로 재처리는 원본 메일함에서 다시 읽는다.
      const parsed = parseMessageId(providerMessageId);
      if (!parsed) return null;

      return withClient(async (client) => {
        const lock = await client.getMailboxLock(parsed.folder);
        try {
          const message = await client.fetchOne(
            String(parsed.uid),
            { source: true },
            { uid: true },
          );
          if (!message || !message.source) return null;
          return toRawMessage(message.source, parsed.uid, parsed.folder);
        } finally {
          lock.release();
        }
      });
    },

    async verifyConnection(): Promise<ConnectionCheckResult> {
      try {
        // 연결·인증만 확인하면 되므로 폴더는 열지 않는다.
        await withClient(async () => undefined);
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
