import type { MailAdapter, MailAdapterCredentials } from "./types";

// KICKOFF STUB — owned by the M1 Gmail track, which replaces this file.
// Kept so the adapter factory typechecks while tracks run in parallel.
export function createGmailAdapter(
  _credentials: MailAdapterCredentials,
): MailAdapter {
  throw new Error("Gmail adapter not implemented yet");
}
