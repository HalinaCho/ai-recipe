// Registered shopping-mall sender domains used to filter mailboxes
// (FR-01-05 Gmail secondary filter, FR-01-06 Naver primary filter).
//
// These defaults apply to every household. A household can register extra
// domains in the shopping_sender_domain table (managed from
// /settings/shopping-domains); the sync pipeline uses the union of both.

export const DEFAULT_SENDER_DOMAINS = [
  "coupang.com",
  "pay.naver.com",
  "naver.com",
  "ssg.com",
  "emart.com",
  "kurly.com",
  "market.kurly.com",
  "gmarket.co.kr",
  "11st.co.kr",
  "auction.co.kr",
  "lotteon.com",
  "homeplus.co.kr",
  "oasis.co.kr",
] as const;
