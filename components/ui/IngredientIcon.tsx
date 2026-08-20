import { resolveIngredientIcon } from "@/lib/icons/ingredient-icon-map";
import { cn } from "@/lib/utils";

export interface IngredientIconProps {
  normalizedName: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASS = {
  sm: "w-8 h-8 text-lg",
  md: "w-12 h-12 text-2xl",
  lg: "w-20 h-20 text-4xl",
} as const;

// FR-19: normalizedName → emoji / AI illustration / category fallback.
export function IngredientIcon({
  normalizedName,
  size = "md",
  className,
}: IngredientIconProps) {
  const { glyph } = resolveIngredientIcon(normalizedName);

  return (
    <span
      role="img"
      aria-label={normalizedName}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-surface-container leading-none",
        SIZE_CLASS[size],
        className,
      )}
    >
      {glyph}
    </span>
  );
}
