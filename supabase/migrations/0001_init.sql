-- 냉파고 (Naeng-Pa-Go) — initial schema
-- Mirrors PRD.md §6 data model. household_id scopes every household-owned
-- table; RLS policies below enforce isolation per NFR-04.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Household / Member
-- ---------------------------------------------------------------------------

create table household (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table member (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- Returns the household_ids the current auth session belongs to.
-- security definer + stable so it can be referenced from RLS policies
-- (including member's own policies) without recursive-policy evaluation.
create or replace function auth_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from member where user_id = auth.uid()
$$;

alter table household enable row level security;
create policy household_select on household for select
  using (id in (select auth_household_ids()));
create policy household_update on household for update
  using (id in (select auth_household_ids()));
-- insert: any authenticated user may create a household (they become owner
-- via a follow-up member insert in the same transaction, app-layer enforced)
create policy household_insert on household for insert
  with check (auth.role() = 'authenticated');

alter table member enable row level security;
create policy member_select on member for select
  using (household_id in (select auth_household_ids()));
create policy member_insert on member for insert
  with check (user_id = auth.uid() or household_id in (select auth_household_ids()));

-- ---------------------------------------------------------------------------
-- Mail connection / processed mail (Phase 1)
-- ---------------------------------------------------------------------------

create table mail_connection (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  connected_by_member_id uuid not null references member(id),
  provider text not null check (provider in ('gmail', 'naver')),
  email_address text not null,
  auth_type text not null check (auth_type in ('oauth', 'imap_app_password')),
  encrypted_secret text not null, -- app-layer AES-256-GCM ciphertext
  last_synced_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  created_at timestamptz not null default now()
);

alter table mail_connection enable row level security;
create policy mail_connection_all on mail_connection for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));

create table processed_mail_record (
  id uuid primary key default gen_random_uuid(),
  mail_connection_id uuid not null references mail_connection(id) on delete cascade,
  provider_message_id text not null,
  processed_at timestamptz not null default now(),
  extraction_status text not null check (extraction_status in ('success', 'failed', 'partial')),
  unique (mail_connection_id, provider_message_id) -- FR-02-03 idempotency key
);

alter table processed_mail_record enable row level security;
create policy processed_mail_record_all on processed_mail_record for all
  using (
    mail_connection_id in (
      select id from mail_connection where household_id in (select auth_household_ids())
    )
  )
  with check (
    mail_connection_id in (
      select id from mail_connection where household_id in (select auth_household_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- Inventory (Phase 1)
-- ---------------------------------------------------------------------------

create table inventory_item (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  normalized_name text not null,
  raw_name text not null,
  quantity text not null,
  purchased_at date not null, -- FIFO sort key
  source_mail_connection_id uuid references mail_connection(id),
  status text not null default 'in_stock' check (status in ('in_stock', 'consumed')),
  consumed_at timestamptz,
  consumed_via text check (consumed_via in ('recipe_cooked', 'manual')),
  created_at timestamptz not null default now()
);
create index inventory_item_household_status_purchased_idx
  on inventory_item (household_id, status, purchased_at);

alter table inventory_item enable row level security;
create policy inventory_item_all on inventory_item for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));

-- ---------------------------------------------------------------------------
-- Ingredient icon map (Phase 1, FR-19) — global reference table
-- ---------------------------------------------------------------------------

create table ingredient_icon_map (
  normalized_name text primary key,
  visual_type text not null check (visual_type in ('emoji', 'generated_illustration', 'category_fallback')),
  asset_ref text not null,
  category text not null check (category in ('vegetable', 'dairy', 'meat', 'seafood', 'grain', 'seasoning', 'other'))
);

alter table ingredient_icon_map enable row level security;
create policy ingredient_icon_map_read on ingredient_icon_map for select
  using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Recipe / RecipeIngredient (Phase 2) — global reference tables
-- ---------------------------------------------------------------------------

create table recipe (
  id uuid primary key default gen_random_uuid(),
  source_api text not null,
  source_recipe_id text not null,
  name text not null,
  image_url text,
  instructions jsonb not null default '[]',
  calories numeric,
  carbohydrate numeric,
  protein numeric,
  fat numeric,
  sodium numeric,
  created_at timestamptz not null default now(),
  unique (source_api, source_recipe_id)
);

alter table recipe enable row level security;
create policy recipe_read on recipe for select
  using (auth.role() = 'authenticated');

create table recipe_ingredient (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipe(id) on delete cascade,
  normalized_name text not null,
  role text not null check (role in ('main', 'seasoning')),
  is_whitelisted_seasoning boolean not null default false
);
create index recipe_ingredient_recipe_idx on recipe_ingredient (recipe_id);

alter table recipe_ingredient enable row level security;
create policy recipe_ingredient_read on recipe_ingredient for select
  using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Weekly meal plan (Phase 3)
-- ---------------------------------------------------------------------------

create table weekly_meal_plan (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  week_start_date date not null,
  created_at timestamptz not null default now(),
  unique (household_id, week_start_date)
);

alter table weekly_meal_plan enable row level security;
create policy weekly_meal_plan_all on weekly_meal_plan for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));

create table meal_plan_entry (
  id uuid primary key default gen_random_uuid(),
  weekly_meal_plan_id uuid not null references weekly_meal_plan(id) on delete cascade,
  date date not null,
  meal_type text not null check (meal_type in ('dinner', 'lunch')),
  is_holiday boolean not null default false,
  recipe_id uuid references recipe(id),
  match_score numeric,
  missing_main_ingredients jsonb not null default '[]',
  source text not null check (source in ('auto', 'swapped', 'manual'))
);
create index meal_plan_entry_plan_idx on meal_plan_entry (weekly_meal_plan_id);

alter table meal_plan_entry enable row level security;
create policy meal_plan_entry_all on meal_plan_entry for all
  using (
    weekly_meal_plan_id in (
      select id from weekly_meal_plan where household_id in (select auth_household_ids())
    )
  )
  with check (
    weekly_meal_plan_id in (
      select id from weekly_meal_plan where household_id in (select auth_household_ids())
    )
  );

-- Note: ShoppingListItem (PRD §6) is intentionally NOT a table — it's
-- computed on demand in Phase 4 from meal_plan_entry.missing_main_ingredients.
