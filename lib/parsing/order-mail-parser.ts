import Anthropic from "@anthropic-ai/sdk";
import { INGREDIENT_ICON_SEED } from "@/lib/icons/ingredient-icon-map";
import type { RawMailMessage } from "@/lib/mail-adapters/types";
import type { ParsedOrderMail, ParsedPurchaseItem } from "@/lib/parsing/types";

// FR-03: 쇼핑몰별 규칙 기반 파서를 만들지 않는다 (FR-03-02). 모든 쇼핑몰 메일이
// 이 한 경로를 지난다 — 템플릿이 바뀌어도 코드를 고칠 필요가 없도록.
// FR-03-03 / NFR-02: 본문은 이 모듈 안에서만 존재하고 절대 저장되지 않는다.

const MODEL = "claude-opus-5";

// 주문 메일 한 통은 짧고 구조가 단순해 medium이면 충분하다. 정규화 품질이
// 걸린 작업이라 low까지는 내리지 않는다.
const EFFORT = "medium" as const;

/**
 * 본문 상한. HTML을 텍스트로 편 영수증 메일은 드물게 수십만 자가 되는데,
 * 품목표는 거의 항상 앞부분에 있다. 잘린 경우 결과를 버리지 않고
 * status를 "partial"로 낮춰 부분 추출을 살린다 (조용한 절삭이 아님).
 */
const MAX_BODY_CHARS = 60_000;

/** 이미 아이콘 매핑이 있는 이름들 — LLM에게 표기 관례를 보여주는 용도. */
const KNOWN_NAMES = INGREDIENT_ICON_SEED.map((e) => e.normalizedName).join(", ");

const SYSTEM_PROMPT = `당신은 한국 온라인 쇼핑몰(쿠팡, 네이버페이, 마켓컬리, SSG, 이마트, 11번가 등)의 주문 확인 메일에서 식재료 정보를 뽑아내는 추출기입니다.

반드시 record_order 도구를 정확히 한 번 호출해서 결과를 돌려주세요. 도구 없이 문장으로 답하면 안 됩니다.

## 구매일 (purchasedAt)
- 본문에서 주문일/결제일을 찾아 YYYY-MM-DD로 변환합니다.
- 배송예정일·도착일이 아니라 **주문한 날**입니다.
- 본문에서 찾을 수 없으면 사용자 메시지에 주어진 메일 수신일을 씁니다.

## 품목 (items)
- 주문서에 실제로 적힌 상품 줄만 뽑습니다.
- rawName: 메일에 적힌 상품명 그대로 (줄임 없이).
- quantity: 메일에 적힌 수량/용량 표기를 그대로 (예: "2개", "1L", "900ml", "1모", "500g"). 단위 환산을 하지 마세요. 표기가 없으면 "1개".
- normalizedName: **브랜드·용량·포장·수식어를 모두 걷어낸 맨 재료 명사 한 단어(또는 관용적 두 단어)**.
  - "서울우유 흰우유 900ml" → "우유"
  - "풀무원 국산콩 부침두부 300g" → "두부"
  - "곰곰 손질 대파 500g" → "대파"
  - "1등급 한우 등심 300g" → "소고기"
  - "하림 닭볶음탕용 닭 1kg" → "닭고기"
  - "동원 참치캔 라이트스탠다드 150g x 4" → "참치"
  - 이미 쓰이고 있는 표기: ${KNOWN_NAMES}
  - 위 목록에 있는 재료라면 **반드시 목록의 표기 그대로** 씁니다. 없으면 같은 관례(맨 재료 명사, 브랜드 없음)로 새로 만듭니다.

## 제외 대상 (items에 넣지 마세요)
- 배송비, 도서산간 추가배송비, 포장비, 봉투/종이백, 아이스팩, 보냉백
- 쿠폰, 할인, 적립금, 포인트, 사은품 안내, 결제수단, 합계/총액 줄
- 식재료가 아닌 생활용품(세제, 화장지, 샴푸, 건전지 등)과 반려동물 사료
- 조리 없이 먹는 완제품이라도 식재료로 쓸 수 있으면 포함합니다(예: 두부, 어묵, 김치).

## complete
- 주문서의 모든 상품 줄을 빠짐없이 읽어냈으면 true.
- 본문이 잘렸거나, 이미지로만 표기돼 읽을 수 없는 줄이 있거나, 일부만 확신할 수 있으면 false.

주문 메일이 아니거나(배송 알림, 광고, 리뷰 요청 등) 식재료가 하나도 없으면 items를 빈 배열로 두고 complete를 true로 두세요.`;

const TOOL_NAME = "record_order";

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "주문 확인 메일에서 뽑아낸 구매일과 식재료 품목 목록을 기록합니다.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      purchasedAt: {
        type: "string",
        description: "주문일. YYYY-MM-DD 형식.",
      },
      items: {
        type: "array",
        description: "식재료 품목만. 배송비·쿠폰 등 비식품 줄은 제외.",
        items: {
          type: "object",
          properties: {
            rawName: { type: "string", description: "메일에 적힌 상품명 그대로." },
            normalizedName: {
              type: "string",
              description: "브랜드·용량·포장을 걷어낸 맨 재료 명사.",
            },
            quantity: {
              type: "string",
              description: "메일 표기 그대로의 수량. 예: \"2개\", \"900ml\".",
            },
          },
          required: ["rawName", "normalizedName", "quantity"],
          additionalProperties: false,
        },
      },
      complete: {
        type: "boolean",
        description: "주문서의 모든 상품 줄을 읽어냈으면 true.",
      },
    },
    required: ["purchasedAt", "items", "complete"],
    additionalProperties: false,
  },
};

/** LLM이 돌려주는 도구 입력의 기대 모양. 실제 검증은 sanitizeExtraction이 한다. */
export interface OrderExtraction {
  purchasedAt: string;
  items: ParsedPurchaseItem[];
  complete: boolean;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

/**
 * 메일 한 통을 구조화 결과로 바꾼다.
 *
 * 던지는 경우와 status:"failed"를 구분한다:
 * - throw  = 인프라 문제(네트워크, 인증, 레이트리밋). 호출측이 이 메일을
 *            processed_mail_record에 남기지 않고 다음 동기화 때 다시 시도한다.
 * - failed = API는 정상 응답했지만 쓸 만한 게 없었다(주문 메일이 아니거나
 *            읽을 수 없음). 이 경우는 기록해서 다시 파싱하지 않는다.
 */
export async function parseOrderMail(
  mail: RawMailMessage,
): Promise<ParsedOrderMail> {
  const truncated = mail.bodyText.length > MAX_BODY_CHARS;
  const body = truncated
    ? mail.bodyText.slice(0, MAX_BODY_CHARS)
    : mail.bodyText;

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { effort: EFFORT },
    tools: [EXTRACTION_TOOL],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `보낸사람: ${mail.from}`,
              `제목: ${mail.subject}`,
              `메일 수신일: ${toIsoDate(mail.receivedAt)}`,
              truncated
                ? "주의: 본문이 길어 앞부분만 전달되었습니다. 잘린 뒷부분이 있으므로 complete는 false로 두세요."
                : "",
              "",
              "--- 본문 ---",
              body,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === TOOL_NAME,
  );

  if (!toolUse) {
    return { purchasedAt: toIsoDate(mail.receivedAt), items: [], status: "failed" };
  }

  return sanitizeExtraction(toolUse.input, mail, { truncated });
}

// 비식품 안전망. FR-03-02가 금지하는 건 "쇼핑몰별 템플릿 파서"이고, 이건
// 쇼핑몰과 무관한 최종 방어선이다 — 1차 책임은 위 프롬프트에 있다.
const NON_FOOD_PATTERNS = [
  "배송비",
  "배달비",
  "택배비",
  "도서산간",
  "포장비",
  "봉투",
  "종이백",
  "쇼핑백",
  "아이스팩",
  "보냉",
  "쿠폰",
  "할인",
  "적립",
  "포인트",
  "마일리지",
  "사은품",
  "결제금액",
  "총액",
  "합계",
  "수수료",
];

function isNonFood(item: ParsedPurchaseItem): boolean {
  const haystack = `${item.rawName} ${item.normalizedName}`;
  return NON_FOOD_PATTERNS.some((pattern) => haystack.includes(pattern));
}

/**
 * LLM 도구 입력을 검증·정리해 ParsedOrderMail로 만든다.
 * 순수 함수라 API 키 없이도 테스트할 수 있다.
 */
export function sanitizeExtraction(
  raw: unknown,
  mail: Pick<RawMailMessage, "receivedAt">,
  options: { truncated?: boolean } = {},
): ParsedOrderMail {
  const fallbackDate = toIsoDate(mail.receivedAt);
  const extraction = (raw ?? {}) as Partial<OrderExtraction>;

  const purchasedAt = isIsoDate(extraction.purchasedAt)
    ? extraction.purchasedAt
    : fallbackDate;

  const rawItems = Array.isArray(extraction.items) ? extraction.items : [];

  const items: ParsedPurchaseItem[] = [];
  let droppedIncomplete = false;

  for (const candidate of rawItems) {
    const rawName = trimOrEmpty((candidate as ParsedPurchaseItem)?.rawName);
    const normalizedName = trimOrEmpty(
      (candidate as ParsedPurchaseItem)?.normalizedName,
    );
    const quantity = trimOrEmpty((candidate as ParsedPurchaseItem)?.quantity);

    if (!rawName || !normalizedName) {
      // 이름이 없으면 재고 카드로도, 레시피 매칭 키로도 쓸 수 없다.
      droppedIncomplete = true;
      continue;
    }

    const item: ParsedPurchaseItem = {
      rawName,
      normalizedName,
      // FR-05-03: 단위 환산은 하지 않는다. 표기가 없으면 "1개"로만 채운다.
      quantity: quantity || "1개",
    };

    if (isNonFood(item)) continue;

    items.push(item);
  }

  const complete = extraction.complete !== false;
  const incomplete = !complete || options.truncated === true || droppedIncomplete;

  const status: ParsedOrderMail["status"] =
    items.length === 0 ? "failed" : incomplete ? "partial" : "success";

  return { purchasedAt, items, status };
}

function trimOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** ISO 8601 타임스탬프를 YYYY-MM-DD로 자른다. 파싱 실패 시 오늘 날짜. */
function toIsoDate(value: string): string {
  const parsed = new Date(value);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return date.toISOString().slice(0, 10);
}
