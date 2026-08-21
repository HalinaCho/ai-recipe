// FR-04-08: 항목 수정 요청의 입력 검증.
//
// 라우트가 아니라 여기 두는 이유는 두 가지다. 순수 함수라 next/server를
// 끌고 올 이유가 없고, 신뢰 경계라 테스트로 붙들어 둬야 한다.

import type {
  ConsumeInventoryItemRequest,
  UpdateInventoryItemRequest,
} from "@/types/api";
import type { InventoryItemPatch } from "@/lib/inventory/queries";
import type { StorageType } from "@/types/domain";

const STORAGE_TYPES: StorageType[] = [
  "refrigerated",
  "frozen",
  "room_temp",
  "unknown",
];

/**
 * 수정 요청이면 패치를, 소진 요청이면 null을, 값이 잘못됐으면 Error를 준다.
 *
 * 이름을 빈 값으로 지우는 걸 막는 게 중요하다. 이름이 비면 매칭에서 영영
 * 빠지는데 화면에는 빈 줄로만 남아, 항목이 왜 추천에 안 잡히는지 알 길이 없다.
 */
export function buildInventoryPatch(
  body: (Partial<ConsumeInventoryItemRequest> &
    Partial<UpdateInventoryItemRequest>) | null,
): InventoryItemPatch | null | Error {
  if (!body) return null;

  const patch: InventoryItemPatch = {};

  if (body.storageType !== undefined) {
    if (!STORAGE_TYPES.includes(body.storageType)) {
      return new Error("보관 방식이 올바르지 않습니다");
    }
    patch.storageType = body.storageType;
  }

  if (body.normalizedName !== undefined) {
    const name = String(body.normalizedName).trim();
    if (name === "") return new Error("재료 이름은 비울 수 없습니다");
    if (name.length > 60) return new Error("재료 이름이 너무 깁니다");
    patch.normalizedName = name;
  }

  if (body.quantity !== undefined) {
    const quantity = String(body.quantity).trim();
    if (quantity.length > 60) return new Error("수량 표기가 너무 깁니다");
    // 비우면 "1개"로 되돌린다 — 빈 수량은 목록에서 점 하나만 남아 어색하다.
    patch.quantity = quantity || "1개";
  }

  if (body.purchasedAt !== undefined) {
    const date = String(body.purchasedAt).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
      return new Error("구매일 형식이 올바르지 않습니다 (YYYY-MM-DD)");
    }
    patch.purchasedAt = date;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
