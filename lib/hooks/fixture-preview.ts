"use client";

import { useEffect, useState } from "react";
import type { InventoryListResponse } from "@/types/api";

/**
 * Local visual-preview switch for the screens track.
 *
 * The 재고/홈 screens are built against the published `/api/inventory`
 * contract, but that route lands in a different worktree. Appending
 * `?preview=fixtures` to any screen makes the inventory hooks read
 * `fixtures/inventory.json` instead of the network; `?preview=empty` renders
 * the "nothing synced yet" state. `?preview=off` clears it.
 *
 * The flag is kept in sessionStorage so it survives tab navigation, and the
 * screens badge themselves ("미리보기 데이터") whenever it is on — preview data
 * must never be mistaken for a real household's inventory.
 */
export type FixturePreviewMode = "off" | "fixtures" | "empty";

const PREVIEW_PARAM = "preview";
const STORAGE_KEY = "npg:fixture-preview";

function isMode(value: string | null): value is FixturePreviewMode {
  return value === "off" || value === "fixtures" || value === "empty";
}

export function fixturePreviewMode(): FixturePreviewMode {
  if (typeof window === "undefined") return "off";
  try {
    const param = new URLSearchParams(window.location.search).get(PREVIEW_PARAM);
    if (isMode(param)) {
      if (param === "off") window.sessionStorage.removeItem(STORAGE_KEY);
      else window.sessionStorage.setItem(STORAGE_KEY, param);
      return param;
    }
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return isMode(stored) ? stored : "off";
  } catch {
    return "off";
  }
}

export function isFixturePreview(): boolean {
  return fixturePreviewMode() !== "off";
}

/** Render-safe reader: always false on the server pass, resolved after mount. */
export function useFixturePreview(): boolean {
  const [preview, setPreview] = useState(false);
  useEffect(() => setPreview(isFixturePreview()), []);
  return preview;
}

export async function loadInventoryFixture(): Promise<InventoryListResponse> {
  if (fixturePreviewMode() === "empty") return { items: [] };
  const fixture = (await import("@/fixtures/inventory.json")).default;
  // The fixture is plain JSON, so TS widens its literal unions to `string`.
  return { items: (fixture as unknown as InventoryListResponse).items };
}
