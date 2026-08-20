import { type VariantProps, cva } from "class-variance-authority";
import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-label-sm",
  {
    variants: {
      tone: {
        secondary: "bg-secondary-container text-on-secondary-container",
        tertiary: "bg-tertiary-container text-on-tertiary-container",
        primary: "bg-primary-container text-on-primary-container",
      },
    },
    defaultVariants: { tone: "secondary" },
  },
);

export interface ChipProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, tone, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(chipVariants({ tone }), className)}
      {...props}
    />
  ),
);
Chip.displayName = "Chip";
