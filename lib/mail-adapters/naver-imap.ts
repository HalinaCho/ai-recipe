import type { MailAdapter, MailAdapterCredentials } from "./types";

// KICKOFF STUB — owned by the M1 Naver IMAP track, which replaces this file.
// Kept so the adapter factory typechecks while tracks run in parallel.
export function createNaverImapAdapter(
  _credentials: MailAdapterCredentials,
): MailAdapter {
  throw new Error("Naver IMAP adapter not implemented yet");
}
