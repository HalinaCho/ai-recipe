-- 레시피 북마크. 재고·식단표와 같은 원칙으로 가구 전체가 공유하는 목록이다
-- (개인별로 나누지 않는다 — 이 앱의 다른 모든 데이터가 가구 단위인 것과
-- 일관되게 둔다). 담기/빼기를 한 사람이 반복해도 행이 늘지 않도록
-- (household_id, recipe_id)에 유니크 제약을 둔다.

create table recipe_bookmark (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  recipe_id uuid not null references recipe(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (household_id, recipe_id)
);

-- 담은 순으로 목록을 그릴 때 쓴다 (최근에 담은 것부터).
create index recipe_bookmark_household_idx
  on recipe_bookmark (household_id, created_at desc);

alter table recipe_bookmark enable row level security;
create policy recipe_bookmark_all on recipe_bookmark for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));
