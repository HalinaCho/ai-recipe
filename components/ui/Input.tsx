import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "min-h-12 w-full rounded-xl border-2 border-outline-variant bg-surface-container-low px-4 text-body-md text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none transition-colors",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
