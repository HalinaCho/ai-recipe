-- 레시피 취향 신호. 재고 소진이 아니라 취향이 추천의 주인공이 되도록 하는
-- 첫 단계(추천 알고리즘 V2 Level 1)의 데이터 축이다.
--
-- recipe_preference: 취향 퀴즈(마이페이지 → 취향 설정)에서 사용자가 직접
-- 매긴 좋아요/보통/싫어요. 가구가 공유하며, 같은 레시피를 다시 평가하면
-- 값만 갱신한다(행이 늘지 않는다).
--
-- recipe_cook_log: "요리함" 처리 이력. 지금까지는 재고 소진만 기록하고
-- 어떤 레시피였는지는 남기지 않아 "자주 만든 메뉴"를 알 방법이 없었다.
-- 반복 요리를 그대로 세야 해서(먹어본 신호는 append-only) 유니크 제약이
-- 없다 — recipe_bookmark(토글)나 recipe_preference(평가 갱신)와 다르다.

create table recipe_preference (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  recipe_id uuid not null references recipe(id) on delete cascade,
  rating text not null check (rating in ('like', 'neutral', 'dislike')),
  created_at timestamptz not null default now(),
  unique (household_id, recipe_id)
);

create index recipe_preference_household_idx
  on recipe_preference (household_id);

alter table recipe_preference enable row level security;
create policy recipe_preference_all on recipe_preference for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));

create table recipe_cook_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  recipe_id uuid not null references recipe(id) on delete cascade,
  cooked_at timestamptz not null default now()
);

create index recipe_cook_log_household_idx
  on recipe_cook_log (household_id, cooked_at desc);

alter table recipe_cook_log enable row level security;
create policy recipe_cook_log_all on recipe_cook_log for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));
