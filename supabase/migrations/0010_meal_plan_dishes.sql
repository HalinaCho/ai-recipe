-- ---------------------------------------------------------------------------
-- FR-13-08: 한 끼니를 여러 요리로 차린다 (한식 상차림).
--
-- 지금까지 한 칸에 레시피가 하나뿐이라 저녁이 "반찬 한 접시"로 끝났다.
-- 한식은 국/찌개와 반찬이 같이 올라와야 한 끼처럼 보인다.
--
-- meal_plan_entry는 계속 **요리 하나**를 뜻한다. 한 끼니는 (date, meal_type)이
-- 같은 행들의 묶음이 된다. 새 테이블을 만들지 않는 이유: 끼니에 붙는 고유
-- 정보가 따로 없고(공휴일 여부는 날짜에서 나온다), 테이블을 나누면 스왑·삭제
-- 경로가 두 벌이 된다.
-- ---------------------------------------------------------------------------

-- 상차림에서의 자리. main = 일품(그 자체로 한 끼), soup = 국·찌개, side = 반찬.
-- 원본 분류(recipe.category)에서 유도하지만 값을 여기 박아 두는 이유는,
-- 배치 당시의 판단을 남겨야 나중에 분류가 바뀌어도 이미 짜인 식단표가
-- 흔들리지 않기 때문이다.
alter table meal_plan_entry add column dish_role text
  check (dish_role in ('main', 'soup', 'side'));

-- 한 끼니에 여러 행이 생기므로 (plan, date, meal_type) 유일성은 더 이상 맞지
-- 않는다. 대신 **같은 끼니에 같은 요리가 두 번** 들어가는 것을 막는다.
alter table meal_plan_entry drop constraint meal_plan_entry_slot_unique;

alter table meal_plan_entry
  add constraint meal_plan_entry_dish_unique
  unique (weekly_meal_plan_id, date, meal_type, recipe_id);
