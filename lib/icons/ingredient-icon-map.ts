import type { IngredientIconMap } from "@/types/domain";

// First-pass seed for FR-19 (§4.2 hybrid icon strategy). The ~80% "common"
// tier uses emoji (Unicode codepoints, rendered via system/Twemoji font —
// no asset file needed). The ~20% Korean-specific tier (두부/김치/어묵 etc.)
// is left on the category_fallback until AI-generated illustrations are
// produced — PRD explicitly allows this to happen in parallel with M1
// rather than blocking it. This same list seeds `ingredient_icon_map` once
// a live Supabase project exists (see supabase/migrations/0001_init.sql).
export const INGREDIENT_ICON_SEED: IngredientIconMap[] = [
  { normalizedName: "우유", visualType: "emoji", assetRef: "🥛", category: "dairy" },
  { normalizedName: "계란", visualType: "emoji", assetRef: "🥚", category: "dairy" },
  { normalizedName: "치즈", visualType: "emoji", assetRef: "🧀", category: "dairy" },
  { normalizedName: "요거트", visualType: "emoji", assetRef: "🥛", category: "dairy" },
  { normalizedName: "양파", visualType: "emoji", assetRef: "🧅", category: "vegetable" },
  { normalizedName: "마늘", visualType: "emoji", assetRef: "🧄", category: "vegetable" },
  { normalizedName: "당근", visualType: "emoji", assetRef: "🥕", category: "vegetable" },
  { normalizedName: "감자", visualType: "emoji", assetRef: "🥔", category: "vegetable" },
  { normalizedName: "고구마", visualType: "emoji", assetRef: "🍠", category: "vegetable" },
  { normalizedName: "대파", visualType: "emoji", assetRef: "🌱", category: "vegetable" },
  { normalizedName: "브로콜리", visualType: "emoji", assetRef: "🥦", category: "vegetable" },
  { normalizedName: "토마토", visualType: "emoji", assetRef: "🍅", category: "vegetable" },
  { normalizedName: "오이", visualType: "emoji", assetRef: "🥒", category: "vegetable" },
  { normalizedName: "버섯", visualType: "emoji", assetRef: "🍄", category: "vegetable" },
  { normalizedName: "고추", visualType: "emoji", assetRef: "🌶️", category: "vegetable" },
  { normalizedName: "배추", visualType: "emoji", assetRef: "🥬", category: "vegetable" },
  { normalizedName: "소고기", visualType: "emoji", assetRef: "🥩", category: "meat" },
  { normalizedName: "돼지고기", visualType: "emoji", assetRef: "🥩", category: "meat" },
  { normalizedName: "닭고기", visualType: "emoji", assetRef: "🍗", category: "meat" },
  { normalizedName: "베이컨", visualType: "emoji", assetRef: "🥓", category: "meat" },
  { normalizedName: "새우", visualType: "emoji", assetRef: "🦐", category: "seafood" },
  { normalizedName: "오징어", visualType: "emoji", assetRef: "🦑", category: "seafood" },
  { normalizedName: "고등어", visualType: "emoji", assetRef: "🐟", category: "seafood" },
  { normalizedName: "쌀", visualType: "emoji", assetRef: "🍚", category: "grain" },
  { normalizedName: "빵", visualType: "emoji", assetRef: "🍞", category: "grain" },
  { normalizedName: "국수", visualType: "emoji", assetRef: "🍜", category: "grain" },
  { normalizedName: "두부", visualType: "category_fallback", assetRef: "grain", category: "grain" },
  { normalizedName: "김치", visualType: "category_fallback", assetRef: "vegetable", category: "vegetable" },
  { normalizedName: "어묵", visualType: "category_fallback", assetRef: "seafood", category: "seafood" },
  { normalizedName: "미역", visualType: "category_fallback", assetRef: "seafood", category: "seafood" },
  { normalizedName: "콩나물", visualType: "category_fallback", assetRef: "vegetable", category: "vegetable" },
];

export const CATEGORY_FALLBACK_ICON: Record<IngredientIconMap["category"], string> = {
  vegetable: "🥬",
  dairy: "🥛",
  meat: "🥩",
  seafood: "🐟",
  grain: "🌾",
  seasoning: "🧂",
  other: "🍽️",
};

const iconByName = new Map(
  INGREDIENT_ICON_SEED.map((entry) => [entry.normalizedName, entry]),
);

export function resolveIngredientIcon(normalizedName: string): {
  glyph: string;
  entry: IngredientIconMap | null;
} {
  const entry = iconByName.get(normalizedName) ?? null;
  if (entry?.visualType === "emoji") {
    return { glyph: entry.assetRef, entry };
  }
  const category = entry?.category ?? "other";
  return { glyph: CATEGORY_FALLBACK_ICON[category], entry };
}
