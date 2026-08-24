import type { RecipeStep } from "@/lib/recipes/steps";

// Hand-written to match supabase/migrations/0001_init.sql.
// TODO: once a live Supabase project exists, regenerate via
// `supabase gen types typescript --project-id <id> > types/database.ts`
// and reconcile any drift with this file.
//
// Every table carries `Relationships: []` and the schema carries empty
// `Views`/`Functions` because @supabase/postgrest-js's GenericTable /
// GenericSchema constraints require those keys to be present — omitting
// them makes the client silently widen Row/Insert/Update to `never`.

export interface Database {
  public: {
    Tables: {
      household: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string; created_at?: string };
        Update: { id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      member: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          display_name: string;
          role: "owner" | "member";
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          display_name: string;
          role: "owner" | "member";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["member"]["Insert"]>;
        Relationships: [];
      };
      mail_connection: {
        Row: {
          id: string;
          household_id: string;
          connected_by_member_id: string;
          provider: "gmail" | "naver";
          email_address: string;
          auth_type: "oauth" | "imap_app_password";
          encrypted_secret: string;
          last_synced_at: string | null;
          status: "active" | "expired" | "revoked";
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          connected_by_member_id: string;
          provider: "gmail" | "naver";
          email_address: string;
          auth_type: "oauth" | "imap_app_password";
          encrypted_secret: string;
          last_synced_at?: string | null;
          status?: "active" | "expired" | "revoked";
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["mail_connection"]["Insert"]
        >;
        Relationships: [];
      };
      processed_mail_record: {
        Row: {
          id: string;
          mail_connection_id: string;
          provider_message_id: string;
          processed_at: string;
          extraction_status: "success" | "failed" | "partial";
        };
        Insert: {
          id?: string;
          mail_connection_id: string;
          provider_message_id: string;
          processed_at?: string;
          extraction_status: "success" | "failed" | "partial";
        };
        Update: Partial<
          Database["public"]["Tables"]["processed_mail_record"]["Insert"]
        >;
        Relationships: [];
      };
      inventory_item: {
        Row: {
          id: string;
          household_id: string;
          normalized_name: string;
          raw_name: string;
          quantity: string;
          purchased_at: string;
          storage_type: "refrigerated" | "frozen" | "room_temp" | "unknown";
          remaining_fraction: number;
          portion_count: number | null;
          source_mail_connection_id: string | null;
          status: "in_stock" | "consumed";
          consumed_at: string | null;
          consumed_via: "recipe_cooked" | "manual" | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          normalized_name: string;
          raw_name: string;
          quantity: string;
          purchased_at: string;
          storage_type?: "refrigerated" | "frozen" | "room_temp" | "unknown";
          remaining_fraction?: number;
          portion_count?: number | null;
          source_mail_connection_id?: string | null;
          status?: "in_stock" | "consumed";
          consumed_at?: string | null;
          consumed_via?: "recipe_cooked" | "manual" | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["inventory_item"]["Insert"]
        >;
        Relationships: [];
      };
      shopping_sender_domain: {
        Row: {
          id: string;
          household_id: string;
          domain: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          domain: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["shopping_sender_domain"]["Insert"]
        >;
        Relationships: [];
      };
      ingredient_icon_map: {
        Row: {
          normalized_name: string;
          visual_type: "emoji" | "generated_illustration" | "category_fallback";
          asset_ref: string;
          category:
            | "vegetable"
            | "dairy"
            | "meat"
            | "seafood"
            | "grain"
            | "seasoning"
            | "other";
        };
        Insert: Database["public"]["Tables"]["ingredient_icon_map"]["Row"];
        Update: Partial<
          Database["public"]["Tables"]["ingredient_icon_map"]["Row"]
        >;
        Relationships: [];
      };
      recipe: {
        Row: {
          id: string;
          source_api: string;
          source_recipe_id: string;
          name: string;
          image_url: string | null;
          instructions: RecipeStep[];
          calories: number | null;
          carbohydrate: number | null;
          protein: number | null;
          fat: number | null;
          sodium: number | null;
          category: string | null;
          cooking_method: string | null;
          ingredients_text: string | null;
          tip: string | null;
          serving_weight: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_api: string;
          source_recipe_id: string;
          name: string;
          image_url?: string | null;
          instructions?: RecipeStep[];
          calories?: number | null;
          carbohydrate?: number | null;
          protein?: number | null;
          fat?: number | null;
          sodium?: number | null;
          category?: string | null;
          cooking_method?: string | null;
          ingredients_text?: string | null;
          tip?: string | null;
          serving_weight?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["recipe"]["Insert"]>;
        Relationships: [];
      };
      recipe_ingredient: {
        Row: {
          id: string;
          recipe_id: string;
          normalized_name: string;
          role: "main" | "seasoning";
          is_whitelisted_seasoning: boolean;
          amount: string | null;
          group_name: string | null;
        };
        Insert: {
          id?: string;
          recipe_id: string;
          normalized_name: string;
          role: "main" | "seasoning";
          is_whitelisted_seasoning?: boolean;
          amount?: string | null;
          group_name?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["recipe_ingredient"]["Insert"]
        >;
        Relationships: [];
      };
      daily_recommendation: {
        Row: {
          id: string;
          household_id: string;
          date: string;
          recipe_id: string;
          rank: number;
          match_score: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          date: string;
          recipe_id: string;
          rank: number;
          match_score?: number | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["daily_recommendation"]["Insert"]
        >;
        Relationships: [];
      };
      weekly_meal_plan: {
        Row: {
          id: string;
          household_id: string;
          week_start_date: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          week_start_date: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["weekly_meal_plan"]["Insert"]
        >;
        Relationships: [];
      };
      meal_plan_entry: {
        Row: {
          id: string;
          weekly_meal_plan_id: string;
          date: string;
          meal_type: "dinner" | "lunch";
          is_holiday: boolean;
          recipe_id: string | null;
          match_score: number | null;
          missing_main_ingredients: string[];
          dish_role: "main" | "soup" | "side" | "convenience" | null;
          convenience_key: string | null;
          source: "auto" | "swapped" | "manual";
        };
        Insert: {
          id?: string;
          weekly_meal_plan_id: string;
          date: string;
          meal_type: "dinner" | "lunch";
          is_holiday?: boolean;
          recipe_id?: string | null;
          match_score?: number | null;
          missing_main_ingredients?: string[];
          dish_role?: "main" | "soup" | "side" | "convenience" | null;
          convenience_key?: string | null;
          source: "auto" | "swapped" | "manual";
        };
        Update: Partial<
          Database["public"]["Tables"]["meal_plan_entry"]["Insert"]
        >;
        Relationships: [];
      };
      // 0007_meal_plan.sql — FR-11-02 특일정보 캐시. 가구와 무관한 전역 참조
      // 데이터라 household_id가 없다.
      public_holiday: {
        Row: { date: string; name: string; fetched_at: string };
        Insert: { date: string; name: string; fetched_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["public_holiday"]["Insert"]
        >;
        Relationships: [];
      };
      // "아직 안 받아왔다"와 "받아왔는데 공휴일이 없더라"를 구분하는 로그.
      public_holiday_fetch_log: {
        Row: { year_month: string; fetched_at: string };
        Insert: { year_month: string; fetched_at?: string };
        Update: Partial<
          Database["public"]["Tables"]["public_holiday_fetch_log"]["Insert"]
        >;
        Relationships: [];
      };
      // 0013_recipe_bookmark.sql — 가구가 공유하는 레시피 저장 목록.
      recipe_bookmark: {
        Row: {
          id: string;
          household_id: string;
          recipe_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          recipe_id: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["recipe_bookmark"]["Insert"]
        >;
        Relationships: [];
      };
      // 0014_recipe_preference.sql — 취향 퀴즈에서 매긴 좋아요/보통/싫어요.
      recipe_preference: {
        Row: {
          id: string;
          household_id: string;
          recipe_id: string;
          rating: "like" | "neutral" | "dislike";
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          recipe_id: string;
          rating: "like" | "neutral" | "dislike";
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["recipe_preference"]["Insert"]
        >;
        Relationships: [];
      };
      // 0014_recipe_preference.sql — "요리함" 이력 (어떤 레시피를 요리했는지).
      recipe_cook_log: {
        Row: {
          id: string;
          household_id: string;
          recipe_id: string;
          cooked_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          recipe_id: string;
          cooked_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["recipe_cook_log"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
