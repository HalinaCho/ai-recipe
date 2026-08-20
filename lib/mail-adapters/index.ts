import { createGmailAdapter } from "./gmail";
import { createNaverImapAdapter } from "./naver-imap";
import type { MailAdapter, MailAdapterCredentials } from "./types";

export * from "./types";
export { DEFAULT_SENDER_DOMAINS } from "./sender-domains";

/**
 * Builds the right adapter for a stored mail connection. This is the only
 * place the sync pipeline should branch on provider — everything downstream
 * works against the MailAdapter interface.
 */
export function createMailAdapter(
  credentials: MailAdapterCredentials,
): MailAdapter {
  switch (credentials.provider) {
    case "gmail":
      return createGmailAdapter(credentials);
    case "naver":
      return createNaverImapAdapter(credentials);
  }
}
