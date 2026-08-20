import type { RecipeMatch } from "@/types/api";
import { cn } from "@/lib/utils";
import { formatMatchRate, matchLevel } from "./format";

const FILL_CLASS = {
  full: "bg-tertiary",
  most: "bg-primary",
  some: "bg-outline",
} as const;

const LABEL_CLASS = {
  full: "bg-tertiary-container text-on-tertiary-container",
  most: "bg-primary-container text-on-primary-container",
  some: "bg-surface-container-high text-on-surface-variant",
} as const;

export interface MatchMeterProps {
  match: RecipeMatch;
  className?: string;
}

/**
 * 매칭률 표시 — DESIGN.md의 Progress Bar 사양(12px 두께, 완전한 라운드).
 * 숫자만 두면 "92점"처럼 읽히기 쉬워서, 길이로도 같이 보여준다.
 */
export function MatchMeter({ match, className }: MatchMeterProps) {
  const level = matchLevel(match.matchRate);
  const percent = Math.round(match.matchRate * 100);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className="h-3 flex-1 overflow-hidden rounded-full bg-surface-container"
        role="img"
        aria-label={`주재료 매칭률 ${percent}퍼센트`}
      >
        <div
          className={cn("h-full rounded-full transition-all", FILL_CLASS[level])}
          style={{ width: `${Math.max(percent, 4)}%` }}
        />
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-label-sm",
          LABEL_CLASS[level],
        )}
        aria-hidden
      >
        {formatMatchRate(match.matchRate)}
      </span>
    </div>
  );
}
