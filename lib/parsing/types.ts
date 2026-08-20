// M1 CROSS-TRACK CONTRACT — published at phase kickoff.
// The parser's output shape. The sync core writes these into
// inventory_item rows; the screens track renders data derived from them.

export interface ParsedPurchaseItem {
  /** Product name exactly as it appeared in the mail (kept for reference). */
  rawName: string;
  /**
   * LLM-normalized ingredient name (e.g. "서울우유 1A 900ml" → "우유").
   * This is the join key for recipe matching (Phase 2) and for icon
   * lookup (FR-19 / lib/icons/ingredient-icon-map.ts), so it must be a
   * bare ingredient noun — no brand, size, or packaging.
   */
  normalizedName: string;
  /** Free text, no unit conversion (FR-05-03), e.g. "1L", "2개", "1모". */
  quantity: string;
}

export interface ParsedOrderMail {
  /** ISO date (YYYY-MM-DD) the order was placed — the FIFO sort key. */
  purchasedAt: string;
  items: ParsedPurchaseItem[];
  /**
   * "partial" when some items were extracted but the parse was incomplete;
   * mirrors processed_mail_record.extraction_status.
   */
  status: "success" | "partial" | "failed";
}
