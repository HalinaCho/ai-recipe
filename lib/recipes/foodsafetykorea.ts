import type { RawSourceRecipe, RecipeSource } from "@/lib/recipes/types";

// FR-06-01: 식약처 "조리식품의 레시피 DB"(COOKRCP01)를 1차 소스로 쓴다.
// 응답은 { COOKRCP01: { total_count, row[], RESULT } } 한 겹으로 감싸여 오고,
// 시작/끝 번호는 1부터 시작하는 닫힌 구간이다.

export const FOODSAFETYKOREA_SOURCE_API = "foodsafetykorea_cookrcp01";

const BASE_URL = "https://openapi.foodsafetykorea.go.kr/api";

/** 한 번에 요청할 수 있는 최대 행 수 (API 제한). */
export const MAX_ROWS_PER_CALL = 1000;

/** 데이터 끝을 지나면 row 없이 이 코드가 온다 — 오류가 아니라 EOF 신호다. */
const NO_DATA_CODE = "INFO-200";
const OK_CODE = "INFO-000";

/** 응답 행에서 실제로 읽는 필드만 적는다 (행에는 50개가 넘는 키가 있다). */
export interface CookRcp01Row {
  RCP_SEQ?: string;
  RCP_NM?: string;
  RCP_PARTS_DTLS?: string;
  ATT_FILE_NO_MAIN?: string;
  ATT_FILE_NO_MK?: string;
  INFO_ENG?: string;
  INFO_CAR?: string;
  INFO_PRO?: string;
  INFO_FAT?: string;
  INFO_NA?: string;
  [key: string]: string | undefined;
}

interface CookRcp01Response {
  COOKRCP01?: {
    total_count?: string;
    row?: CookRcp01Row[];
    RESULT?: { CODE?: string; MSG?: string };
  };
}

function getApiKey(): string {
  const key = process.env.FOODSAFETYKOREA_API_KEY;
  if (!key) {
    throw new Error(
      "FOODSAFETYKOREA_API_KEY 가 설정되지 않았습니다 — 레시피를 수집할 수 없습니다",
    );
  }
  return key;
}

async function callApi(
  start: number,
  end: number,
): Promise<{ rows: CookRcp01Row[]; totalCount: number }> {
  const url = `${BASE_URL}/${getApiKey()}/COOKRCP01/json/${start}/${end}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `식약처 API 응답 오류 (${response.status} ${response.statusText})`,
    );
  }

  const body = (await response.json()) as CookRcp01Response;
  const payload = body.COOKRCP01;

  if (!payload) {
    throw new Error("식약처 API 응답에 COOKRCP01 본문이 없습니다");
  }

  const code = payload.RESULT?.CODE ?? "";
  if (code === NO_DATA_CODE) {
    return { rows: [], totalCount: Number(payload.total_count ?? 0) || 0 };
  }
  if (code && code !== OK_CODE) {
    throw new Error(`식약처 API 오류 ${code}: ${payload.RESULT?.MSG ?? ""}`);
  }

  return {
    rows: payload.row ?? [],
    totalCount: Number(payload.total_count ?? 0) || 0,
  };
}

/** 수집 진행률 표시용. 목록 첫 행만 받아 total_count를 읽는다. */
export async function fetchTotalCount(): Promise<number> {
  const { totalCount } = await callApi(1, 1);
  return totalCount;
}

export function createFoodSafetyKoreaSource(): RecipeSource {
  return {
    sourceApi: FOODSAFETYKOREA_SOURCE_API,

    async fetchPage(offset: number, limit: number): Promise<RawSourceRecipe[]> {
      const size = Math.min(Math.max(limit, 1), MAX_ROWS_PER_CALL);
      // 소스 API는 1부터 시작하는 닫힌 구간을 쓴다.
      const start = Math.max(offset, 0) + 1;
      const { rows } = await callApi(start, start + size - 1);
      return rows
        .map(mapCookRcp01Row)
        .filter((recipe): recipe is RawSourceRecipe => recipe !== null);
    },
  };
}

/**
 * 응답 행 하나를 RawSourceRecipe로 옮긴다.
 * 식별자나 이름이 없는 행은 저장할 수 없으므로 null을 돌려주고 버린다.
 */
export function mapCookRcp01Row(row: CookRcp01Row): RawSourceRecipe | null {
  const sourceRecipeId = (row.RCP_SEQ ?? "").trim();
  const name = (row.RCP_NM ?? "").trim();
  if (!sourceRecipeId || !name) return null;

  return {
    sourceRecipeId,
    name,
    imageUrl: pickImageUrl(row),
    instructions: parseInstructions(row),
    ingredientsText: (row.RCP_PARTS_DTLS ?? "").trim(),
    nutrition: {
      calories: toNumber(row.INFO_ENG),
      carbohydrate: toNumber(row.INFO_CAR),
      protein: toNumber(row.INFO_PRO),
      fat: toNumber(row.INFO_FAT),
      sodium: toNumber(row.INFO_NA),
    },
  };
}

/**
 * 완성 사진(MAIN)을 우선 쓰고 없으면 썸네일(MK)로 떨어진다.
 * 원본이 http라 https 페이지에서 그대로 쓰면 혼합 콘텐츠로 차단된다 —
 * 같은 호스트가 https로도 서빙하므로 저장 시점에 올려 둔다.
 */
function pickImageUrl(row: CookRcp01Row): string | null {
  const url = (row.ATT_FILE_NO_MAIN ?? "").trim() || (row.ATT_FILE_NO_MK ?? "").trim();
  if (!url) return null;
  return url.replace(/^http:\/\//i, "https://");
}

/**
 * MANUAL01~20을 순서대로 모은다.
 *
 * 실제 데이터에는 (1) 중간에 빈 슬롯이 섞여 있고, (2) 문장 앞에 "1." 번호가
 * 붙어 있으며, (3) 문장 끝에 이미지 대응용 알파벳 한 글자가 붙는 행이 있다.
 * 화면에서 번호는 다시 매기므로 여기서 세 가지를 모두 걷어낸다.
 */
export function parseInstructions(row: CookRcp01Row): string[] {
  const steps: string[] = [];

  for (let i = 1; i <= 20; i += 1) {
    const raw = row[`MANUAL${String(i).padStart(2, "0")}`];
    if (typeof raw !== "string") continue;

    const step = raw
      .replace(/\r/g, "")
      .trim()
      .replace(/^\d+\s*[.)]\s*/, "")
      .replace(/(?<=[가-힣.)\]])\s*[a-zA-Z]$/, "")
      .trim();

    if (step) steps.push(step);
  }

  return steps;
}

function toNumber(value: string | undefined): number {
  const parsed = Number((value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
