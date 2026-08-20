-- FR-09-01: "오늘의 추천 레시피"는 하루 단위로 고정된다. 매번 계산하면
-- 재고가 조금만 바뀌어도 홈 화면 추천이 갈아엎어져, 아침에 본 걸 저녁에
-- 다시 찾을 수 없다. 그래서 그날의 선택을 저장해 두고 날짜가 바뀔 때만
-- 새로 뽑는다.

create table daily_recommendation (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  -- 가구 기준 날짜(Asia/Seoul). 서버 배포 지역에 따라 흔들리지 않도록
  -- 애플리케이션이 KST로 계산해 넣는다.
  date date not null,
  recipe_id uuid not null references recipe(id) on delete cascade,
  -- 화면에 보여줄 순서. 0이 첫 번째.
  rank integer not null,
  -- 뽑을 당시의 점수 — 나중에 추천 품질을 되짚어 볼 때 필요하다.
  match_score numeric,
  created_at timestamptz not null default now(),
  unique (household_id, date, recipe_id)
);

create index daily_recommendation_household_date_idx
  on daily_recommendation (household_id, date, rank);

alter table daily_recommendation enable row level security;
create policy daily_recommendation_all on daily_recommendation for all
  using (household_id in (select auth_household_ids()))
  with check (household_id in (select auth_household_ids()));
