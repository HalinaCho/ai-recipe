// M2 CROSS-TRACK CONTRACT — published at phase kickoff.
// Do not change these shapes unilaterally: the ingestion track, the
// matching track, and the screens track all build against them
// concurrently. If a change is genuinely needed, stop and flag it.

import type { Recipe } from "@/types/domain";

/**
 * FR-06-02: 레시피 소스를 추상화해 두어 나중에 다른 공공 API나 민간 API를
 * 소스로 추가할 수 있게 한다. 식약처(COOKRCP01)가 1차 구현체다.
 */
export interface RecipeSource {
  /** recipe.source_api에 저장되는 식별자. */
  readonly sourceApi: string;

  /**
   * 소스에서 레시피를 페이지 단위로 읽어온다. 수집은 배치(1회성)라
   * 런타임 경로가 아니므로 전량 순회를 전제로 한다.
   */
  fetchPage(offset: number, limit: number): Promise<RawSourceRecipe[]>;
}

/**
 * 소스 API가 준 그대로의 레시피. 재료 필드는 비정형 텍스트이며,
 * 구조화는 수집 시점에 LLM이 1회 수행한다 (FR-07-01).
 */
export interface RawSourceRecipe {
  sourceRecipeId: string;
  name: string;
  imageUrl: string | null;
  instructions: string[];
  /** 예: RCP_PARTS_DTLS — "돼지고기 300g, 양파 1개, 간장 2큰술 ..." */
  ingredientsText: string;
  nutrition: Recipe["nutrition"];
}

/** LLM이 재료 텍스트를 분해한 결과 (FR-07-01). */
export interface StructuredIngredient {
  /**
   * 정규화된 재료명. 재고(inventory_item.normalized_name)와 이 값이
   * 맞아떨어져야 매칭이 되므로, 메일 파서와 같은 표기 관례를 따른다
   * (브랜드·용량 없는 맨 재료 명사).
   */
  normalizedName: string;
  /** 주재료(main)만 매칭 점수에 들어간다. 양념은 seasoning. */
  role: "main" | "seasoning";
}
