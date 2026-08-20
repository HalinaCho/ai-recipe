import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TopAppBarProps {
  title: string;
  action?: ReactNode;
  className?: string;
}

export function TopAppBar({ title, action, className }: TopAppBarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center justify-between bg-surface/80 backdrop-blur-xl px-container-padding py-4",
        className,
      )}
    >
      <h1 className="text-headline-md text-on-surface">{title}</h1>
      {action}
    </header>
  );
}
