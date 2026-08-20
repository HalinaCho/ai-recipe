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

export interface InventoryItem {
  id: string;
  householdId: string;
  normalizedName: string;
  rawName: string;
  quantity: string;
  purchasedAt: string; // FIFO sort key
  sourceMailConnectionId: string | null;
  status: "in_stock" | "consumed";
  consumedAt: string | null;
  consumedVia: "recipe_cooked" | "manual" | null;
}

export interface IngredientIconMap {
  normalizedName: string;
  visualType: "emoji" | "generated_illustration" | "category_fallback";
  assetRef: string;
  category:
    | "vegetable"
    | "dairy"
    | "meat"
    | "seafood"
    | "grain"
    | "seasoning"
    | "other";
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
  instructions: string[];
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

export interface MealPlanEntry {
  date: string;
  mealType: "dinner" | "lunch";
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
