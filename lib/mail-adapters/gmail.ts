import { type gmail_v1, google } from "googleapis";
import type {
  ConnectionCheckResult,
  MailAdapter,
  MailAdapterCredentials,
  MailFetchOptions,
  RawMailMessage,
} from "./types";

export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";

/** Gmail's own cap for users.messages.list. */
const GMAIL_MAX_RESULTS = 500;
const DEFAULT_MAX_RESULTS = 50;

/** Gmail's per-user rate limit is generous, but bursts of 500 gets are not. */
const FETCH_CONCURRENCY = 5;

/**
 * The stored refresh token no longer works (user revoked access in their
 * Google account, changed password, or the token aged out while unused).
 * The caller catches this to flip mail_connection.status to "expired"
 * rather than retrying forever.
 */
export class GmailAuthError extends Error {
  readonly code = "mail_auth_expired" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GmailAuthError";
  }
}

export function isGmailAuthError(error: unknown): error is GmailAuthError {
  return error instanceof GmailAuthError;
}

/**
 * FR-01-02: this is the Gmail DATA-ACCESS client, a different Google Cloud
 * OAuth client from the login one (which lives in Supabase Auth's provider
 * config and never appears in app env).
 */
export function getGmailOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI;

  const missing = [
    !clientId && "GMAIL_OAUTH_CLIENT_ID",
    !clientSecret && "GMAIL_OAUTH_CLIENT_SECRET",
    !redirectUri && "GMAIL_OAUTH_REDIRECT_URI",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Gmail OAuth is not configured — missing ${missing.join(", ")}`,
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
  };
}

export function createGmailOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getGmailOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * What travels on the authorize URL's `state`. The nonce is the CSRF
 * half — it is matched against an httpOnly cookie on the way back — and
 * the ids let the callback confirm the round-trip belongs to the same
 * user and household it started for. Nothing here is trusted on its own.
 */
/** httpOnly cookie holding the CSRF nonce while the user is at Google. */
export const GMAIL_OAUTH_STATE_COOKIE = "npg_gmail_oauth_state";

export interface GmailOAuthState {
  nonce: string;
  userId: string;
  householdId: string;
  memberId: string;
}

export function encodeGmailOAuthState(state: GmailOAuthState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeGmailOAuthState(raw: string): GmailOAuthState | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (!parsed || typeof parsed !== "object") return null;

    const { nonce, userId, householdId, memberId } = parsed as Record<
      string,
      unknown
    >;
    if (
      typeof nonce !== "string" ||
      typeof userId !== "string" ||
      typeof householdId !== "string" ||
      typeof memberId !== "string"
    ) {
      return null;
    }
    return { nonce, userId, householdId, memberId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Query building (FR-01-05, NFR-01)
// ---------------------------------------------------------------------------

/**
 * `category:purchases` is the primary filter; the registered shopping
 * domains narrow it further. Both are always present — an unfiltered
 * mailbox read is forbidden (NFR-01), so an empty domain list is a bug,
 * not a "fetch everything" instruction.
 */
export function buildGmailQuery(options: MailFetchOptions): string {
  const domains = options.senderDomains
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  if (domains.length === 0) {
    throw new Error(
      "senderDomains is empty — refusing to query an unfiltered mailbox (NFR-01)",
    );
  }

  const parts = [
    "category:purchases",
    `(${domains.map((domain) => `from:${domain}`).join(" OR ")})`,
  ];

  if (options.since) {
    parts.push(`after:${toGmailDate(options.since)}`);
  }

  return parts.join(" ");
}

/** Gmail's `after:` wants YYYY/MM/DD, not ISO. */
function toGmailDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`invalid "since" date: ${iso}`);
  }
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${date.getUTCFullYear()}/${month}/${day}`;
}

// ---------------------------------------------------------------------------
// Body decoding
// ---------------------------------------------------------------------------

function decodeBase64Url(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Walks the MIME tree collecting text/plain and text/html separately.
 * Korean order mails are usually multipart/alternative with an HTML part
 * carrying the item table, so the HTML fallback is the common path.
 */
function collectBodies(
  part: gmail_v1.Schema$MessagePart | undefined,
  found: { plain: string[]; html: string[] },
): void {
  if (!part) return;

  const mimeType = part.mimeType ?? "";
  const data = part.body?.data;

  if (data) {
    if (mimeType.startsWith("text/plain")) {
      found.plain.push(decodeBase64Url(data));
    } else if (mimeType.startsWith("text/html")) {
      found.html.push(decodeBase64Url(data));
    }
  }

  for (const child of part.parts ?? []) {
    collectBodies(child, found);
  }
}

export function extractBodyText(message: gmail_v1.Schema$Message): string {
  const found = { plain: [] as string[], html: [] as string[] };
  collectBodies(message.payload ?? undefined, found);

  if (found.plain.length > 0) {
    return found.plain.join("\n").trim();
  }
  if (found.html.length > 0) {
    return stripHtml(found.html.join("\n"));
  }
  // Last resort: some senders put the whole body on the root part with no
  // recognizable text mime type.
  return (message.snippet ?? "").trim();
}

function getHeader(
  message: gmail_v1.Schema$Message,
  name: string,
): string | undefined {
  const header = message.payload?.headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  );
  return header?.value ?? undefined;
}

function toRawMailMessage(message: gmail_v1.Schema$Message): RawMailMessage {
  const dateHeader = getHeader(message, "Date");
  const internalDate = message.internalDate
    ? new Date(Number(message.internalDate))
    : undefined;
  const parsedHeaderDate = dateHeader ? new Date(dateHeader) : undefined;

  const receivedAt =
    internalDate && !Number.isNaN(internalDate.getTime())
      ? internalDate
      : parsedHeaderDate && !Number.isNaN(parsedHeaderDate.getTime())
        ? parsedHeaderDate
        : new Date();

  return {
    providerMessageId: message.id ?? "",
    from: getHeader(message, "From") ?? "",
    subject: getHeader(message, "Subject") ?? "",
    receivedAt: receivedAt.toISOString(),
    // NFR-02 / FR-03-03: held in memory for the parser only, never persisted.
    bodyText: extractBodyText(message),
  };
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

interface GaxiosLikeError {
  code?: string | number;
  status?: number;
  message?: string;
  response?: { status?: number; data?: unknown };
}

function statusOf(error: GaxiosLikeError): number | undefined {
  const raw = error.response?.status ?? error.status ?? error.code;
  return typeof raw === "number" ? raw : undefined;
}

/**
 * Google reports a dead refresh token as `invalid_grant` on the token
 * endpoint and as 401 on API calls. Both mean "reconnect required", not
 * "retry later".
 */
function isAuthFailure(error: unknown): boolean {
  const err = error as GaxiosLikeError;
  const message = String(err?.message ?? "");
  const data = err?.response?.data;
  const dataError =
    data && typeof data === "object" && "error" in data
      ? String((data as { error: unknown }).error)
      : "";

  return (
    statusOf(err) === 401 ||
    message.includes("invalid_grant") ||
    message.includes("invalid_rapt") ||
    message.includes("Token has been expired or revoked") ||
    dataError === "invalid_grant" ||
    dataError === "unauthorized_client"
  );
}

function rethrow(error: unknown, context: string): never {
  if (isAuthFailure(error)) {
    throw new GmailAuthError(
      `Gmail authorization is no longer valid (${context}) — the connection must be re-authorized`,
      { cause: error },
    );
  }
  throw error;
}

function isNotFound(error: unknown): boolean {
  return statusOf(error as GaxiosLikeError) === 404;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export function createGmailAdapter(
  credentials: MailAdapterCredentials,
): MailAdapter {
  // Built lazily so a missing-env misconfiguration surfaces as a caught
  // error inside a method (verifyConnection can report it) rather than
  // blowing up at construction time in the sync loop.
  let client: gmail_v1.Gmail | undefined;

  function gmail(): gmail_v1.Gmail {
    if (!client) {
      const auth = createGmailOAuthClient();
      auth.setCredentials({ refresh_token: credentials.secret });
      client = google.gmail({ version: "v1", auth });
    }
    return client;
  }

  async function getMessage(id: string): Promise<RawMailMessage | null> {
    try {
      const { data } = await gmail().users.messages.get({
        userId: "me",
        id,
        format: "full",
      });
      return toRawMailMessage(data);
    } catch (error) {
      if (isNotFound(error)) return null;
      rethrow(error, `messages.get ${id}`);
    }
  }

  return {
    provider: "gmail",

    async fetchOrderMails(
      options: MailFetchOptions,
    ): Promise<RawMailMessage[]> {
      const q = buildGmailQuery(options);
      const maxResults = Math.min(
        options.maxResults ?? DEFAULT_MAX_RESULTS,
        GMAIL_MAX_RESULTS,
      );

      let ids: string[];
      try {
        const { data } = await gmail().users.messages.list({
          userId: "me",
          q,
          maxResults,
        });
        ids = (data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id));
      } catch (error) {
        rethrow(error, "messages.list");
      }

      const messages: RawMailMessage[] = [];
      for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
        const chunk = await Promise.all(
          ids.slice(i, i + FETCH_CONCURRENCY).map((id) => getMessage(id)),
        );
        for (const message of chunk) {
          if (message) messages.push(message);
        }
      }
      return messages;
    },

    // FR-03-04: re-processing reads the mailbox again — we keep no copy.
    fetchMessageById(providerMessageId: string) {
      return getMessage(providerMessageId);
    },

    async verifyConnection(): Promise<ConnectionCheckResult> {
      try {
        const { data } = await gmail().users.getProfile({ userId: "me" });
        return {
          ok: true,
          emailAddress: data.emailAddress ?? credentials.emailAddress,
        };
      } catch (error) {
        return {
          ok: false,
          error: isAuthFailure(error)
            ? "Gmail authorization is no longer valid — the connection must be re-authorized"
            : error instanceof Error
              ? error.message
              : "Gmail connection check failed",
        };
      }
    },
  };
}
