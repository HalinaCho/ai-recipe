-- PRD v1.4 (FR-04-02·FR-04-04·FR-05-03).
--
-- 1) 보관 방식: 순수 FIFO는 냉동식품을 신선채소보다 먼저 먹으라고 안내한다.
--    실제로 5일 전 산 냉동 계란말이가 같은 날 산 상추와 나란히 "먼저 드세요"로
--    올라오는 것을 확인했다. 정렬은 애플리케이션이 보관방식별 기준일수로
--    경과율을 계산해 처리하고, DB는 분류만 들고 있는다.
--
-- 2) 남은 비율: 한 번에 다 쓰지 않는 재료가 흔한데 전량/미소진 2단계뿐이라
--    재고가 현실과 어긋났다. 단위 환산(500g 중 200g)은 여전히 하지 않고
--    비율만 기록한다.

alter table inventory_item
  add column storage_type text not null default 'unknown'
    check (storage_type in ('refrigerated', 'frozen', 'room_temp', 'unknown')),
  -- 1 = 미개봉, 0.5 = 반 남음, 0 = 소진. 0이 되면 status도 consumed가 된다.
  add column remaining_fraction numeric not null default 1
    check (remaining_fraction >= 0 and remaining_fraction <= 1);

-- 기존 행 보정: 이미 소진 처리된 항목은 남은 비율이 0이어야 일관된다.
update inventory_item
  set remaining_fraction = 0
  where status = 'consumed';

-- 정렬이 storage_type을 함께 보므로 인덱스에 포함한다.
drop index if exists inventory_item_household_status_purchased_idx;
create index inventory_item_household_status_storage_purchased_idx
  on inventory_item (household_id, status, storage_type, purchased_at);
