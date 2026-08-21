-- ---------------------------------------------------------------------------
-- M3 (Phase 3 — 주간 식단표) 준비
--
-- weekly_meal_plan / meal_plan_entry 테이블 자체는 0001_init.sql에 이미 있다.
-- 여기서는 배치 로직을 실제로 돌리는 데 필요한 두 가지를 보탠다:
--   1) 끼니 칸의 유일성 제약 (재생성·동시 요청이 칸을 중복 생성하지 않도록)
--   2) 공휴일 캐시 (FR-11-02, 외부 API를 매 요청마다 두드리지 않도록)
-- ---------------------------------------------------------------------------

-- (1) FR-12-01: 한 주의 같은 날 같은 끼니는 칸이 하나뿐이다.
--
-- 제약이 없으면 사용자가 식단표 탭을 두 번 빠르게 열거나 재생성을 연타할 때
-- 같은 칸이 두 벌 생겨 화면에 저녁이 두 개로 보인다. 앱 코드의 "있으면 안
-- 만든다" 검사는 두 요청이 겹치는 순간을 막지 못하므로, DB가 최종 방어선이
-- 되어야 한다 (M1의 processed_mail_record가 멱등성을 잡는 것과 같은 방식).
alter table meal_plan_entry
  add constraint meal_plan_entry_slot_unique
  unique (weekly_meal_plan_id, date, meal_type);

-- (2) FR-11-02: 한국천문연구원 특일정보 캐시.
--
-- 공휴일은 한 번 정해지면 바뀌지 않는 값이라 매번 외부 API를 부를 이유가 없다.
-- 캐시를 별도 테이블로 두는 더 중요한 이유는 **장애 격리**다. 식단표 생성은
-- 공휴일 조회에 의존하는데, data.go.kr이 죽었다고 해서 식단표가 통째로 실패하면
-- 안 된다. 캐시가 있으면 그 값으로 계속 돌고, 캐시도 없으면 "공휴일 없음"으로
-- 진행한다 (주말 판정은 날짜만으로 되므로 최소한의 정확도는 유지된다).
--
-- 전역 참조 데이터다 — 공휴일은 가구마다 다르지 않다.
create table public_holiday (
  date date primary key,
  name text not null,
  fetched_at timestamptz not null default now()
);

-- 조회한 달에 공휴일이 하나도 없을 수도 있다. 그때 행이 안 생기면 "아직 안
-- 받아왔다"와 "받아왔는데 없더라"를 구분할 수 없어 매번 다시 부르게 된다.
create table public_holiday_fetch_log (
  year_month text primary key, -- 'YYYY-MM'
  fetched_at timestamptz not null default now()
);

alter table public_holiday enable row level security;
create policy public_holiday_read on public_holiday for select
  using (auth.role() = 'authenticated');

alter table public_holiday_fetch_log enable row level security;
create policy public_holiday_fetch_log_read on public_holiday_fetch_log for select
  using (auth.role() = 'authenticated');

-- 쓰기는 service role 전용 (recipe/ingredient_icon_map과 동일한 취급).
