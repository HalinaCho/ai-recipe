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
          instructions: string[];
          calories: number | null;
          carbohydrate: number | null;
          protein: number | null;
          fat: number | null;
          sodium: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_api: string;
          source_recipe_id: string;
          name: string;
          image_url?: string | null;
          instructions?: string[];
          calories?: number | null;
          carbohydrate?: number | null;
          protein?: number | null;
          fat?: number | null;
          sodium?: number | null;
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
        };
        Insert: {
          id?: string;
          recipe_id: string;
          normalized_name: string;
          role: "main" | "seasoning";
          is_whitelisted_seasoning?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["recipe_ingredient"]["Insert"]
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
          source: "auto" | "swapped" | "manual";
        };
        Update: Partial<
          Database["public"]["Tables"]["meal_plan_entry"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
