// Registered shopping-mall sender domains used to filter mailboxes
// (FR-01-05 Gmail secondary filter, FR-01-06 Naver primary filter).
//
// These defaults apply to every household. A household can register extra
// domains in the shopping_sender_domain table (managed from
// /settings/shopping-domains); the sync pipeline uses the union of both.

// IMAP FROM 검색은 부분 문자열 매칭이라 "coupang.com"이
// noreply@e.coupang.com도 잡는다. 그래서 서브도메인을 따로 적지 않는다.
//
// 반대로 그 성질 때문에 "naver.com"은 절대 넣으면 안 된다 — 네이버메일
// 사용자에게는 본인이 보낸 메일과 지인과 주고받은 사적인 메일까지 전부
// 걸려든다(실제 계정에서 771통 오검출). 주문 메일만 최소로 읽는다는
// NFR-01에 정면으로 어긋나므로 결제 전용인 pay.naver.com만 쓴다.
export const DEFAULT_SENDER_DOMAINS = [
  "coupang.com",
  "pay.naver.com",
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
