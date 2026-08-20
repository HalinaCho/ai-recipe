// Shared request/response contracts for app/api routes.
// Phase kickoffs append to this file rather than redefining types
// elsewhere — see the M1~M4 parallel-track plan.
//
// M1 CROSS-TRACK CONTRACT: everything under "M1" below is consumed by the
// screens track before the backend track has finished implementing it.
// Do not change these shapes unilaterally.

import type { Household, InventoryItem, Member } from "@/types/domain";

// ---------------------------------------------------------------------------
// M0 — household
// ---------------------------------------------------------------------------

export interface CreateHouseholdRequest {
  name: string;
}

export interface CreateHouseholdResponse {
  household: Household;
  member: Member;
}

export interface HouseholdMembersResponse {
  members: Member[];
}

// ---------------------------------------------------------------------------
// M1 — inventory
// ---------------------------------------------------------------------------

/** One row of the 재고 tab, already FIFO-ordered by the server (FR-04-02). */
export interface InventoryListItem extends InventoryItem {
  /** Whole days since purchase — drives the "오래된 순" visual emphasis. */
  daysSincePurchase: number;
}

/** GET /api/inventory — in-stock items, oldest purchase first. */
export interface InventoryListResponse {
  items: InventoryListItem[];
}

/**
 * PATCH /api/inventory/[id] — mark one item consumed (FR-05-02 manual
 * removal). Phase 2's "요리함" checklist reuses this with
 * consumedVia: "recipe_cooked".
 */
export interface ConsumeInventoryItemRequest {
  consumedVia: "manual" | "recipe_cooked";
}

export interface ConsumeInventoryItemResponse {
  item: InventoryItem;
}

// ---------------------------------------------------------------------------
// M1 — mail connections
// ---------------------------------------------------------------------------

/** Safe projection of a mail_connection — never exposes the secret. */
export interface MailConnectionSummary {
  id: string;
  provider: "gmail" | "naver";
  emailAddress: string;
  lastSyncedAt: string | null;
  status: "active" | "expired" | "revoked";
}

export interface MailConnectionsResponse {
  connections: MailConnectionSummary[];
}

/** POST /api/mail-connections — Naver only; Gmail arrives via OAuth callback. */
export interface CreateNaverMailConnectionRequest {
  emailAddress: string;
  /** Plaintext app password; the server encrypts before storing (NFR-03). */
  appPassword: string;
}

export interface CreateMailConnectionResponse {
  connection: MailConnectionSummary;
}

// ---------------------------------------------------------------------------
// M1 — sync
// ---------------------------------------------------------------------------

/** POST /api/sync — manual sync button (FR-02-02). */
export interface SyncResponse {
  /** Mails newly processed this run (already-seen IDs are skipped). */
  processedMailCount: number;
  /** Inventory rows created from those mails. */
  addedItemCount: number;
  /** Per-connection outcome, so the UI can surface a single failed account. */
  connections: {
    mailConnectionId: string;
    emailAddress: string;
    status: "success" | "failed";
    error?: string;
  }[];
}

// ---------------------------------------------------------------------------
// M1 — shopping sender domains (settings)
// ---------------------------------------------------------------------------

export interface ShoppingSenderDomainsResponse {
  /** Built-in domains that apply to every household (read-only in the UI). */
  defaults: string[];
  /** Household-specific additions. */
  custom: { id: string; domain: string }[];
}

export interface AddShoppingSenderDomainRequest {
  domain: string;
}
