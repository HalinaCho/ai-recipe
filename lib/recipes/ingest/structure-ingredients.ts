import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { INGREDIENT_ICON_SEED } from "@/lib/icons/ingredient-icon-map";
import { SEASONING_WHITELIST, isWhitelistedSeasoning } from "@/lib/recipes/seasonings";
import type { StructuredIngredient } from "@/lib/recipes/types";

// FR-07-01: 식약처의 재료 필드는 비정형 텍스트라 LLM으로 한 번 구조화한다.
// 이 호출은 수집 배치에서만 일어난다 — 런타임 추천 경로에는 LLM이 없다.
//
// 여기서 만드는 normalizedName은 재고(inventory_item.normalized_name)와
// 맞물리는 조인 키다. 메일 파서(lib/parsing/order-mail-parser.ts)와 표기
// 관례가 어긋나면 매칭이 조용히 0이 되므로, 프롬프트는 그쪽과 같은 예시·같은
// 기존 표기 목록을 보여 준다.

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

// 스키마가 강제돼 있고 판단할 것은 정규화·분류뿐이라 깊은 추론이 필요 없다.
const THINKING_LEVEL = ThinkingLevel.LOW;

/** 한 번의 호출에 묶을 레시피 수. 레시피가 1000건대라 건당 호출은 낭비다. */
export const DEFAULT_BATCH_SIZE = 15;

/** 재료 텍스트 상한. 식약처 재료 필드는 길어야 수백 자다. */
const MAX_PARTS_CHARS = 2_000;

/** 메일 파서와 같은 목록 — LLM에게 이미 쓰이고 있는 표기를 보여 준다. */
const KNOWN_NAMES = INGREDIENT_ICON_SEED.map((e) => e.normalizedName).join(", ");
const KNOWN_SEASONINGS = SEASONING_WHITELIST.join(", ");

const SYSTEM_PROMPT = `당신은 한국 조리법의 재료 문장을 구조화하는 추출기입니다. 여러 레시피를 한 번에 받아, 각 레시피의 재료를 정규화된 이름과 역할로 분해합니다.

지정된 JSON 스키마에 맞는 JSON만 출력하세요. 설명 문장이나 코드블록 표시를 덧붙이지 마세요.

## 출력 단위
- 입력에 주어진 모든 레시피에 대해 항목을 하나씩 만듭니다. sourceRecipeId는 입력에 적힌 값을 그대로 옮깁니다.
- 재료를 하나도 읽어낼 수 없는 레시피는 ingredients를 빈 배열로 둡니다. 다른 레시피까지 비우지 마세요.

## normalizedName — 재고와 맞물리는 조인 키
**브랜드·용량·수량·부위·가공 표기를 모두 걷어낸 맨 재료 명사 한 단어(또는 관용적 두 단어)**로 씁니다.
- "연두부 75g(3/4모)" → "두부"
- "순두부 80g(1/3모)" → "두부"
- "다진 쇠고기 40g" → "소고기"
- "닭가슴살 100g" → "닭고기"
- "통삼겹 200g" → "돼지고기"
- "칵테일새우 20g(5마리)" → "새우"
- "다진 대파 5g(1작은술)" → "대파"
- "방울토마토 150g(5개)" → "방울토마토"
- "표고버섯 30g" → "표고버섯"
- "저염간장 3g" → "간장"
- 이미 쓰이고 있는 표기: ${KNOWN_NAMES}
- 조미료는 다음 표기를 그대로 씁니다: ${KNOWN_SEASONINGS}
- 위 두 목록에 있는 재료라면 **반드시 목록의 표기 그대로** 씁니다. "쇠고기"가 아니라 "소고기", "달걀"이 아니라 "계란", "올리브오일"·"올리브기름"이 아니라 "올리브유", "식용유"·"카놀라유"·"포도씨유"는 목록의 표기 그대로. 목록에 없으면 같은 관례로 새로 만듭니다.
- 품종·색·부위만 다른 것은 대표 재료명으로 모읍니다(청피망·홍피망 → 피망, 알배추 → 배추, 쪽파 → 대파).
- 단, 요리에서 서로 대체할 수 없을 만큼 다른 재료는 합치지 않습니다(방울토마토와 토마토, 고구마와 감자는 각각 그대로).
- **상위 범주로 뭉개지 마세요.** 생선·해산물·버섯·나물은 종류 이름을 그대로 씁니다("대구"를 "생선"으로, "느타리버섯"을 "버섯"으로 바꾸지 않습니다). 종류를 알 수 없을 때만 범주명을 씁니다.
- 반대로 크기·색·품종 수식어와 부위 접미사는 뗍니다: "자색고구마" → "고구마", "미니새송이버섯" → "새송이버섯", "멥쌀"·"찹쌀" → "쌀", "대구살" → "대구", "떡국떡" → "떡". 단 "방울토마토"처럼 장을 볼 때 따로 사는 재료는 그대로 둡니다.
- 젓갈·건어물처럼 가공이 재료의 정체인 것은 가공명을 유지합니다(새우젓 → "새우젓", 멸치액젓 → "액젓", 황태채 → "황태").
- "약간", "적당량", "고명", "양념장", "육수", "●주재료" 같은 수량·구획 표시나 요리 이름 줄은 재료가 아닙니다. 빼세요.
- 같은 재료가 여러 번 나오면 한 번만 씁니다.

## role — main 또는 seasoning
- main: 그 요리를 이루는 재료. 고기·해산물·채소·두부·면·밥·유제품 등.
- seasoning: 간을 맞추거나 향을 내려고 소량 쓰는 것. 장류·기름·가루양념·식초·당류·술·물·전분·소스류.
- 다음 이름은 언제나 seasoning입니다: ${KNOWN_SEASONINGS}
- 같은 재료라도 주인공이면 main입니다(예: 감자탕의 감자는 main, 카레의 카레가루는 seasoning).
- 육수용 다시마·멸치처럼 우려내고 건져내는 재료는 seasoning으로 둡니다.`;

/** responseJsonSchema로 그대로 넘기는 표준 JSON Schema. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      description: "입력으로 준 레시피와 같은 개수, 같은 순서.",
      items: {
        type: "object",
        properties: {
          sourceRecipeId: {
            type: "string",
            description: "입력에 적힌 레시피 ID를 그대로.",
          },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                normalizedName: {
                  type: "string",
                  description: "브랜드·용량·부위를 걷어낸 맨 재료 명사.",
                },
                role: {
                  type: "string",
                  enum: ["main", "seasoning"],
                  description: "주재료면 main, 양념이면 seasoning.",
                },
              },
              required: ["normalizedName", "role"],
              additionalProperties: false,
            },
          },
        },
        required: ["sourceRecipeId", "ingredients"],
        additionalProperties: false,
      },
    },
  },
  required: ["recipes"],
  additionalProperties: false,
} as const;

/** 구조화에 필요한 최소한의 입력. RawSourceRecipe에서 골라 담는다. */
export interface StructuringInput {
  sourceRecipeId: string;
  name: string;
  ingredientsText: string;
}

/**
 * 구조화에 성공한 레시피만 담긴 맵(키: sourceRecipeId).
 * 빠져 있는 레시피는 실패다 — 호출측이 실패로 세고 다음 실행에서 다시 시도한다.
 */
export type StructuringResult = Map<string, StructuredIngredient[]>;

export type StructureFn = (
  inputs: StructuringInput[],
) => Promise<StructuringResult>;

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set — cannot structure recipe ingredients",
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/**
 * 레시피 여러 건의 재료를 한 번의 호출로 구조화한다.
 *
 * 메일 파서와 같은 구분을 지킨다:
 * - throw  = 인프라 문제(네트워크, 인증, 레이트리밋). 호출측이 재시도한다.
 * - 결과에서 빠짐 = 응답은 왔지만 그 레시피는 쓸 수 없었다.
 *
 * 응답 전체가 망가진 경우 배치를 반으로 갈라 다시 시도한다. 재료 텍스트
 * 하나가 이상해서 응답이 깨지더라도 나머지 레시피까지 잃지 않기 위해서다
 * (끝까지 쪼개지면 그 한 건만 실패로 남는다).
 */
export async function structureRecipeIngredients(
  inputs: StructuringInput[],
): Promise<StructuringResult> {
  if (inputs.length === 0) return new Map();

  const prompt = [
    "다음 레시피들의 재료를 구조화하세요.",
    "",
    ...inputs.map((input) =>
      [
        `### 레시피 ID: ${input.sourceRecipeId}`,
        `메뉴명: ${input.name}`,
        `재료: ${input.ingredientsText.slice(0, MAX_PARTS_CHARS)}`,
      ].join("\n"),
    ),
  ].join("\n\n");

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel: THINKING_LEVEL },
      maxOutputTokens: 32000,
      // 같은 레시피는 언제 수집해도 같은 재료명이 나와야 한다.
      temperature: 0,
    },
  });

  const parsed = parseJsonResponse(response.text);

  if (parsed === null) {
    if (inputs.length === 1) return new Map();

    const middle = Math.floor(inputs.length / 2);
    const [left, right] = await Promise.all([
      structureRecipeIngredients(inputs.slice(0, middle)),
      structureRecipeIngredients(inputs.slice(middle)),
    ]);
    return new Map([...left, ...right]);
  }

  return sanitizeStructuredBatch(parsed, inputs);
}

/**
 * LLM 응답을 검증·정리해 레시피별 재료 목록으로 만든다.
 * 순수 함수라 API 키 없이도 테스트할 수 있다.
 */
export function sanitizeStructuredBatch(
  raw: unknown,
  inputs: StructuringInput[],
): StructuringResult {
  const expected = new Set(inputs.map((input) => input.sourceRecipeId));
  const result: StructuringResult = new Map();

  const recipes = (raw as { recipes?: unknown } | null)?.recipes;
  if (!Array.isArray(recipes)) return result;

  for (const entry of recipes) {
    const candidate = entry as {
      sourceRecipeId?: unknown;
      ingredients?: unknown;
    } | null;

    const sourceRecipeId =
      typeof candidate?.sourceRecipeId === "string"
        ? candidate.sourceRecipeId.trim()
        : "";

    // 요청하지 않은 ID를 지어낸 경우는 버린다.
    if (!expected.has(sourceRecipeId) || result.has(sourceRecipeId)) continue;
    if (!Array.isArray(candidate?.ingredients)) continue;

    const ingredients = sanitizeIngredients(candidate.ingredients);

    // 재료가 하나도 안 남으면 저장해도 매칭에 쓸 수 없다 — 실패로 둔다.
    if (ingredients.length === 0) continue;

    result.set(sourceRecipeId, ingredients);
  }

  return result;
}

/** 재료명에 섞여 오는 수량·구획 표기를 걸러내는 안전망. */
const NOT_AN_INGREDIENT = [
  "약간",
  "적당량",
  "주재료",
  "부재료",
  "양념장",
  "양념",
  "소스",
  "고명",
  "육수",
  "재료",
  "기타",
];

function sanitizeIngredients(raw: unknown[]): StructuredIngredient[] {
  const byName = new Map<string, StructuredIngredient>();

  for (const item of raw) {
    const candidate = item as {
      normalizedName?: unknown;
      role?: unknown;
    } | null;

    const normalizedName = normalizeName(candidate?.normalizedName);
    if (!normalizedName) continue;
    if (NOT_AN_INGREDIENT.includes(normalizedName)) continue;

    // 화이트리스트 조미료가 main으로 오면 매칭에서 주재료로 세어 버린다.
    // 목록이 판단의 기준이므로 여기서 역할을 맞춘다 (FR-07-02).
    const role: StructuredIngredient["role"] = isWhitelistedSeasoning(
      normalizedName,
    )
      ? "seasoning"
      : candidate?.role === "seasoning"
        ? "seasoning"
        : "main";

    const existing = byName.get(normalizedName);
    if (existing) {
      // 같은 재료가 주재료로도 나왔다면 주재료로 남긴다.
      if (existing.role === "seasoning" && role === "main") {
        existing.role = "main";
      }
      continue;
    }

    byName.set(normalizedName, { normalizedName, role });
  }

  return [...byName.values()];
}

/** 이름 정리: 공백 정돈, 수량·괄호 꼬리 제거. */
function normalizeName(value: unknown): string {
  if (typeof value !== "string") return "";

  const cleaned = value
    .replace(/\([^)]*\)/g, "")
    .replace(/[·,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // 숫자·단위가 남아 있으면 정규화에 실패한 것이므로 쓰지 않는다.
  if (!cleaned || /\d/.test(cleaned) || cleaned.length > 20) return "";
  return cleaned;
}

/**
 * 응답 본문을 JSON으로 읽는다. 스키마를 걸어도 모델이 드물게 ```json 펜스를
 * 덧붙이는 경우가 있어 한 번 벗겨내고 재시도한다.
 */
function parseJsonResponse(text: string | undefined): unknown {
  if (!text) return null;

  const candidates = [
    text,
    text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 다음 후보로
    }
  }
  return null;
}
