"use client";

import { useEffect, useState } from "react";
import type {
  CookChecklistResponse,
  InventoryListResponse,
  RecipeDetailResponse,
  RecipeListItem,
  RecipeListResponse,
  TodayRecipesResponse,
} from "@/types/api";

/**
 * Local visual-preview switch for the screens track.
 *
 * The 재고/홈/레시피 screens are built against the published `/api/inventory`
 * and `/api/recipes*` contracts, but those routes land in a different
 * worktree. Appending `?preview=fixtures` to any screen makes the inventory
 * and recipe hooks read `fixtures/inventory.json` / `fixtures/recipes.json`
 * instead of the network; `?preview=empty` renders the "nothing synced yet"
 * state. `?preview=off` clears it.
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

// ---------------------------------------------------------------------------
// M2 — recipes
//
// `fixtures/recipes.json` ships one full detail + one cook checklist (for the
// top-scoring recipe). The other list entries get a detail/checklist derived
// from their own RecipeMatch, so the 부족 재료 and 밀키트 CTA branches can be
// looked at on screen too. Same flag, same badge — no second switch.
// ---------------------------------------------------------------------------

interface RecipesFixture {
  recipes: RecipeListItem[];
  detail: RecipeDetailResponse;
  cookChecklist: CookChecklistResponse;
}

async function loadRecipesFixtureFile(): Promise<RecipesFixture> {
  const fixture = (await import("@/fixtures/recipes.json")).default;
  return fixture as unknown as RecipesFixture;
}

export async function loadRecipeListFixture(): Promise<RecipeListResponse> {
  if (fixturePreviewMode() === "empty") return { recipes: [] };
  const { recipes } = await loadRecipesFixtureFile();
  return { recipes };
}

/** 오늘의 추천 — 목록 상위 세 개를 그날의 큐레이션으로 본다 (FR-09-01). */
export async function loadTodayRecipesFixture(): Promise<TodayRecipesResponse> {
  const date = new Date().toISOString().slice(0, 10);
  if (fixturePreviewMode() === "empty") return { date, recipes: [] };
  const { recipes } = await loadRecipesFixtureFile();
  return { date, recipes: recipes.slice(0, 3) };
}

/** 파생 상세에 붙는 기본 조미료 — 화이트리스트라 매칭에서 빠진다는 걸 보여준다. */
const DERIVED_SEASONINGS = ["소금", "간장", "참기름"];

export async function loadRecipeDetailFixture(
  id: string,
): Promise<RecipeDetailResponse> {
  const { recipes, detail } = await loadRecipesFixtureFile();
  if (id === detail.id) return detail;

  const listItem = recipes.find((recipe) => recipe.id === id);
  if (!listItem) {
    throw new Error("샘플 데이터에 없는 레시피예요. (?preview=off 로 끄기)");
  }

  return {
    id: listItem.id,
    name: listItem.name,
    imageUrl: listItem.imageUrl,
    instructions: [
      `${listItem.match.ownedMainIngredients.join(", ") || "재료"}를 먹기 좋은 크기로 손질한다.`,
      "달군 팬에 재료를 넣고 중불에서 볶는다.",
      "간을 맞추고 한소끔 더 익혀 마무리한다.",
    ],
    nutrition: {
      calories: listItem.calories,
      carbohydrate: null,
      protein: null,
      fat: null,
      sodium: null,
    },
    ingredients: [
      ...listItem.match.ownedMainIngredients.map((name) => ({
        normalizedName: name,
        role: "main" as const,
        isWhitelistedSeasoning: false,
        inStock: true,
      })),
      ...listItem.match.missingMainIngredients.map((name) => ({
        normalizedName: name,
        role: "main" as const,
        isWhitelistedSeasoning: false,
        inStock: false,
      })),
      ...DERIVED_SEASONINGS.map((name) => ({
        normalizedName: name,
        role: "seasoning" as const,
        isWhitelistedSeasoning: true,
        inStock: false,
      })),
    ],
    match: listItem.match,
    showMealKitCta: listItem.showMealKitCta,
  };
}

export async function loadCookChecklistFixture(
  id: string,
): Promise<CookChecklistResponse> {
  const { recipes, detail, cookChecklist } = await loadRecipesFixtureFile();
  if (id === detail.id) return cookChecklist;

  const listItem = recipes.find((recipe) => recipe.id === id);
  if (!listItem) return { items: [] };

  return {
    items: listItem.match.ownedMainIngredients.map((name, index) => ({
      inventoryItemId: `preview-${listItem.id}-${index}`,
      normalizedName: name,
      rawName: `${name} (샘플 재고)`,
      quantity: "1개",
      daysSincePurchase: 3 + index * 4,
    })),
  };
}
