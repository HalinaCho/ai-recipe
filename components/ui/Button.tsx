import { type VariantProps, cva } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-label-md transition-all active:scale-[0.97] active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none min-h-12 px-6",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary shadow-tinted hover:shadow-tinted-hover",
        secondary: "bg-surface-container-lowest text-primary border-2 border-primary",
        ghost: "bg-transparent text-on-surface-variant hover:bg-surface-container",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
