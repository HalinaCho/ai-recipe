import type { RecipeStep } from "@/lib/recipes/steps";

// Domain types mirroring PRD.md §6. These describe the shape the app code
// works with (camelCase); `types/database.ts` describes the raw Supabase
// row shape (snake_case) that these are mapped from/to.

export interface Household {
  id: string;
  name: string;
  createdAt: string;
}

export interface Member {
  id: string;
  householdId: string;
  userId: string;
  displayName: string;
  role: "owner" | "member";
}

export type MailConnectionAuth =
  | { type: "oauth"; encryptedRefreshToken: string } // Gmail
  | { type: "imap_app_password"; encryptedAppPassword: string }; // 네이버메일

export interface MailConnection {
  id: string;
  householdId: string;
  connectedByMemberId: string;
  provider: "gmail" | "naver";
  emailAddress: string;
  auth: MailConnectionAuth;
  lastSyncedAt: string | null;
  status: "active" | "expired" | "revoked";
}

export interface ProcessedMailRecord {
  id: string;
  mailConnectionId: string;
  providerMessageId: string; // Gmail message ID or IMAP UID — idempotency key
  processedAt: string;
  extractionStatus: "success" | "failed" | "partial";
}

/** FR-04-04. 주문 메일의 상품명 표기 → 재료명 추정 → unknown 순으로 정해진다. */
export type StorageType =
  | "refrigerated"
  | "frozen"
  | "room_temp"
  | "unknown";

export interface InventoryItem {
  id: string;
  householdId: string;
  normalizedName: string;
  rawName: string;
  quantity: string;
  purchasedAt: string;
  /** 보관 방식. 정렬 우선순위를 좌우한다 (FR-04-02). */
  storageType: StorageType;
  /** 1 = 미개봉, 0.5 = 반 남음, 0 = 소진 (FR-05-03). 단위 환산은 하지 않는다. */
  remainingFraction: number;
  sourceMailConnectionId: string | null;
  status: "in_stock" | "consumed";
  consumedAt: string | null;
  consumedVia: "recipe_cooked" | "manual" | null;
}

/**
 * 재료 대분류. FR-19의 아이콘 폴백에 쓰이고, M3에서는 FR-13-04 다양성
 * 보너스의 집계 단위이기도 하다 — "최근에 고기만 샀으니 이번엔 생선"을
 * 판단하려면 재료를 묶을 축이 필요하다.
 */
export type IngredientCategory =
  | "vegetable"
  | "dairy"
  | "meat"
  | "seafood"
  | "grain"
  | "seasoning"
  | "other";

export interface IngredientIconMap {
  normalizedName: string;
  visualType: "emoji" | "generated_illustration" | "category_fallback";
  assetRef: string;
  category: IngredientCategory;
}

export interface RecipeIngredient {
  normalizedName: string;
  role: "main" | "seasoning";
  isWhitelistedSeasoning: boolean;
}

export interface Recipe {
  id: string;
  sourceApi: "foodsafetykorea_cookrcp01" | string;
  sourceRecipeId: string;
  name: string;
  imageUrl: string | null;
  /** 조리 단계. 글과 사진이 한 쌍이다 (FR-06-03). */
  instructions: RecipeStep[];
  // 소스에 영양정보가 없을 수 있고, DB 컬럼도 nullable이다. 없는 값을 0으로
  // 채우면 "정보 없음"과 "나트륨 0"이 구분되지 않으므로 null을 그대로 둔다.
  nutrition: {
    calories: number | null;
    carbohydrate: number | null;
    protein: number | null;
    fat: number | null;
    sodium: number | null;
  };
  ingredients: RecipeIngredient[];
}

export type MealType = "lunch" | "dinner";

/**
 * FR-13-08: 상차림에서의 자리.
 * main = 일품(그 자체로 한 끼) · soup = 국·찌개 · side = 반찬
 */
export type MealPlanDishRole = "main" | "soup" | "side";

export interface MealPlanEntry {
  /** meal_plan_entry.id — 스왑·직접선택(FR-12-02·03)이 지목하는 대상. */
  id: string;
  date: string;
  mealType: MealType;
  isHoliday: boolean;
  recipeId: string;
  matchScore: number;
  missingMainIngredients: string[];
  source: "auto" | "swapped" | "manual";
}

export interface WeeklyMealPlan {
  id: string;
  householdId: string;
  weekStartDate: string;
  entries: MealPlanEntry[];
}

export interface ShoppingListItem {
  normalizedName: string;
  usedInRecipeIds: string[];
  coupangDeepLink: string | null;
  naverShoppingLink: string | null;
  mealKitOptions: {
    recipeId: string;
    coupangDeepLink: string | null;
  }[];
}
