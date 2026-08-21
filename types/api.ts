// Shared request/response contracts for app/api routes.
// Phase kickoffs append to this file rather than redefining types
// elsewhere — see the M1~M4 parallel-track plan.
//
// M1 CROSS-TRACK CONTRACT: everything under "M1" below is consumed by the
// screens track before the backend track has finished implementing it.
// Do not change these shapes unilaterally.

import type {
  Household,
  InventoryItem,
  Member,
  StorageType,
} from "@/types/domain";

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

/** 재고 탭의 한 줄. 서버가 이미 소진 우선순위로 정렬해서 준다 (FR-04-02). */
export interface InventoryListItem extends InventoryItem {
  /** 구매 후 경과일. 화면에는 "5일 전"처럼 그대로 쓴다. */
  daysSincePurchase: number;
  /**
   * 경과일 ÷ 보관방식별 기준일수. 1을 넘으면 한참 지난 것.
   * 정렬 기준이자, 화면이 "먼저 드세요"를 어디까지 붙일지 판단하는 근거다.
   */
  elapsedRatio: number;
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
  /**
   * 쓰고 **남길** 비율 (FR-05-03). 0 = 다 씀(기본), 0.5 = 반 남김.
   * 0이 아니면 재고에 그대로 남아 계속 레시피 매칭에 잡힌다.
   */
  remainingFraction?: number;
}

export interface ConsumeInventoryItemResponse {
  item: InventoryItem;
}

/**
 * PATCH /api/inventory/[id] 로 보관 방식만 고칠 때 (FR-04-05).
 * 추출·추정이 틀릴 수 있어 사용자가 바로잡을 수 있어야 한다.
 */
export interface UpdateInventoryItemRequest {
  storageType: StorageType;
}

/**
 * POST /api/inventory — 직접 추가 (FR-04-06).
 * 메일 파싱이 못 잡는 마트·시장 구매를 메우는 탈출구다.
 */
export interface CreateInventoryItemRequest {
  /** 레시피 어휘에서 고른 정규화된 재료명 (FR-04-07). */
  normalizedName: string;
  /** 자유 텍스트. 비우면 normalizedName을 그대로 쓴다. */
  rawName?: string;
  quantity: string;
  /** YYYY-MM-DD. 비우면 오늘(Asia/Seoul). */
  purchasedAt?: string;
  storageType?: StorageType;
}

export interface CreateInventoryItemResponse {
  item: InventoryItem;
}

/**
 * GET /api/ingredients — 자동완성용 재료 어휘 (FR-04-07).
 * 레시피에서 실제로 쓰이는 이름만 담기므로, 여기서 고른 재료는
 * 레시피 매칭이 반드시 성립한다.
 */
export interface IngredientVocabularyResponse {
  /** 주재료로 쓰이는 이름 — 매칭에 실제로 기여한다. */
  main: string[];
  /** 양념류까지 포함한 전체. 검색 폴백용. */
  all: string[];
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

// ---------------------------------------------------------------------------
// M2 — recipes
// ---------------------------------------------------------------------------

/** 매칭 계산 결과. 화면이 "부족 재료"와 매칭률을 그대로 보여준다. */
export interface RecipeMatch {
  /** 0~1. FR-08-01 공식의 결과. */
  score: number;
  /** 보유 주재료 / 필요 주재료 (조미료 제외). 0~1. */
  matchRate: number;
  /** 재고에 있는 주재료. */
  ownedMainIngredients: string[];
  /** 없는 주재료 — 장보기 후보이자 상세 화면의 "부족 재료" (FR-08-02). */
  missingMainIngredients: string[];
  /**
   * 이 레시피가 쓰는 소진임박(오래된) 재료. FR-08-01의 두 번째 항이며,
   * "이거 먼저 드세요" 문구의 근거가 된다.
   */
  usesExpiringIngredients: string[];
}

/** 레시피 목록의 한 칸 (FR-09-02, 매칭률순 정렬). */
export interface RecipeListItem {
  id: string;
  name: string;
  imageUrl: string | null;
  calories: number | null;
  match: RecipeMatch;
  /**
   * FR-10-01: 매칭률이 애매한 구간이면 "밀키트로 간편하게" CTA를 노출한다.
   * 구간 판단은 서버가 하고 화면은 결과만 쓴다.
   */
  showMealKitCta: boolean;
}

export interface RecipeListResponse {
  recipes: RecipeListItem[];
}

/** GET /api/recipes/today — 하루 단위로 고정되는 오늘의 추천 (FR-09-01). */
export interface TodayRecipesResponse {
  date: string;
  recipes: RecipeListItem[];
}

export interface RecipeIngredientDetail {
  normalizedName: string;
  role: "main" | "seasoning";
  isWhitelistedSeasoning: boolean;
  /** 재고에 있는지 — 상세 화면의 체크 표시. */
  inStock: boolean;
}

/** GET /api/recipes/[id] */
export interface RecipeDetailResponse {
  id: string;
  name: string;
  imageUrl: string | null;
  instructions: string[];
  nutrition: {
    calories: number | null;
    carbohydrate: number | null;
    protein: number | null;
    fat: number | null;
    sodium: number | null;
  };
  ingredients: RecipeIngredientDetail[];
  match: RecipeMatch;
  showMealKitCta: boolean;
}

/**
 * POST /api/recipes/[id]/cook — "요리함" 처리 (FR-05-01).
 * 체크리스트에서 사용자가 실제로 쓴 재료만 골라 보낸다. 기본값은 전부 체크지만
 * 최종 판단은 사용자 것이므로, 서버는 받은 목록만 소진 처리한다.
 */
export interface CookRecipeRequest {
  /** 소진 처리할 inventory_item id 목록. */
  consumedInventoryItemIds: string[];
  /**
   * 항목별로 **남길** 비율 (FR-05-03). 생략하거나 0이면 전량 소진.
   * 0보다 크면 재고에 남아 계속 레시피 매칭에 잡힌다.
   */
  remainingFractions?: Record<string, number>;
}

export interface CookRecipeResponse {
  consumedCount: number;
}

/** 요리함 체크리스트에 뿌릴 후보 — 이 레시피가 쓰는, 재고에 있는 항목. */
export interface CookChecklistItem {
  inventoryItemId: string;
  normalizedName: string;
  rawName: string;
  quantity: string;
  daysSincePurchase: number;
}

/** GET /api/recipes/[id]/cook — 체크리스트 조회. */
export interface CookChecklistResponse {
  items: CookChecklistItem[];
}
