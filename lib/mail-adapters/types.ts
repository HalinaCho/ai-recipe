// M1 CROSS-TRACK CONTRACT — published at phase kickoff.
// Do not change these shapes unilaterally: the Gmail track, the Naver IMAP
// track, and the sync/parsing core all build against them concurrently.
// If a change is genuinely needed, stop and flag it so it can be re-published.

/**
 * One shopping-order email, as fetched from a provider.
 *
 * NFR-02 / FR-03-03: `bodyText` is passed to the parser in memory and then
 * discarded — it must never be written to the database. Re-processing goes
 * back to the provider via `fetchMessageById` (FR-03-04).
 */
export interface RawMailMessage {
  /** Gmail message ID or IMAP UID — the idempotency key (FR-02-03). */
  providerMessageId: string;
  from: string;
  subject: string;
  /** ISO 8601. */
  receivedAt: string;
  bodyText: string;
}

export interface MailFetchOptions {
  /**
   * Sender domains to filter on. Gmail uses these to narrow
   * `category:purchases` (FR-01-05); Naver IMAP uses them as its only
   * filter via SEARCH FROM (FR-01-06). Never fetch an unfiltered mailbox.
   */
  senderDomains: string[];
  /** ISO date — only fetch mail received on or after this. */
  since?: string;
  maxResults?: number;
}

export interface ConnectionCheckResult {
  ok: boolean;
  emailAddress?: string;
  error?: string;
}

/**
 * Provider-agnostic read-only mail access. Gmail (OAuth) and Naver (IMAP)
 * each implement this so the sync pipeline stays provider-independent.
 */
export interface MailAdapter {
  readonly provider: "gmail" | "naver";

  /** Fetch order mails matching the filter. Read-only. */
  fetchOrderMails(options: MailFetchOptions): Promise<RawMailMessage[]>;

  /** Re-fetch a single message by its provider ID (FR-03-04). */
  fetchMessageById(providerMessageId: string): Promise<RawMailMessage | null>;

  /** Verify credentials still work — used on connect and to detect expiry. */
  verifyConnection(): Promise<ConnectionCheckResult>;
}

/**
 * What a stored mail_connection row provides to build an adapter.
 * `secret` is already DECRYPTED by the caller (see lib/crypto.ts) — adapters
 * never touch ciphertext themselves.
 */
export interface MailAdapterCredentials {
  provider: "gmail" | "naver";
  emailAddress: string;
  /** Gmail: OAuth refresh token. Naver: IMAP app password. */
  secret: string;
}
