import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "bg-surface-container-lowest rounded-xl p-3 shadow-tinted",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";
