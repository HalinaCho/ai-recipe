-- ---------------------------------------------------------------------------
-- FR-13-09·FR-13-10: 재료 쏠림 완화 + 간편조리식 자리.
--
-- 레시피 소스(식약처)에는 "사서 데우기만 하는 것"이 없다. 그런데 실제 장보기에서
-- 그게 큰 몫이다 — 곰탕 한 팩을 사두면 바쁜 날 한 끼가 된다. 한 주를 전부
-- 직접 만드는 요리로 채우면 며칠 만에 버려지는 식단표가 되므로, 몇 끼는
-- 간편식 자리로 남긴다.
--
-- 간편식은 레시피가 아니라 **장바구니 후보**라서 recipe 테이블에 넣지 않는다.
-- 필요한 건 이름과 검색어뿐인데 레시피 테이블은 재료·조리법·영양을 요구한다.
-- 목록은 코드(lib/meal-plan/convenience.ts)에 두고 여기에는 키만 남긴다.
-- ---------------------------------------------------------------------------

alter table meal_plan_entry drop constraint meal_plan_entry_dish_role_check;
alter table meal_plan_entry add constraint meal_plan_entry_dish_role_check
  check (dish_role in ('main', 'soup', 'side', 'convenience'));

alter table meal_plan_entry add column convenience_key text;

-- 요리 자리는 레시피이거나 간편식이거나 **둘 중 하나**다. 양쪽 다 비면
-- 이름 없는 빈 칸이 되어 화면에 정체불명의 줄이 남는다.
alter table meal_plan_entry add constraint meal_plan_entry_dish_target_check
  check (
    (dish_role = 'convenience' and convenience_key is not null)
    or (dish_role is distinct from 'convenience' and recipe_id is not null)
  );

-- recipe_id가 null인 행이 생기므로 기존 유일성 제약이 맞지 않는다
-- (null은 서로 같지 않아 중복이 통과한다). 각각 부분 인덱스로 나눈다.
alter table meal_plan_entry drop constraint meal_plan_entry_dish_unique;
create unique index meal_plan_entry_recipe_unique
  on meal_plan_entry (weekly_meal_plan_id, date, meal_type, recipe_id)
  where recipe_id is not null;
create unique index meal_plan_entry_convenience_unique
  on meal_plan_entry (weekly_meal_plan_id, date, meal_type, convenience_key)
  where convenience_key is not null;
