"use client";

import { formatWeekOffsetLabel, formatWeekRange } from "./format";
import { weekEndOf } from "./week";

export interface WeekNavigatorProps {
  weekStart: string;
  today: string;
  onPrev: () => void;
  onNext: () => void;
  /** 이번 주가 아닐 때만 보이는 복귀 버튼 — 길을 잃지 않게. */
  onToday: () => void;
}

/**
 * 주 이동 (PRD §4.1 식단표 탭 상단).
 * 범위만 적어두면 지금 어느 주를 보는지 헷갈려서 "이번 주 / 다음 주"를 같이 쓴다.
 */
export function WeekNavigator({
  weekStart,
  today,
  onPrev,
  onNext,
  onToday,
}: WeekNavigatorProps) {
  const offsetLabel = formatWeekOffsetLabel(weekStart, today);
  const isThisWeek = offsetLabel === "이번 주";

  return (
    <div className="flex items-center gap-2">
      <ArrowButton
        icon="chevron_left"
        label="이전 주 보기"
        onClick={onPrev}
      />

      <div className="flex min-w-0 flex-1 flex-col items-center">
        <span className="text-label-sm text-primary">{offsetLabel}</span>
        <span className="text-body-lg text-on-surface">
          {formatWeekRange(weekStart, weekEndOf(weekStart))}
        </span>
      </div>

      <ArrowButton icon="chevron_right" label="다음 주 보기" onClick={onNext} />

      {!isThisWeek && (
        <button
          type="button"
          onClick={onToday}
          className="min-h-12 shrink-0 rounded-full bg-primary-container px-3 text-label-sm text-on-primary-container transition-all active:scale-[0.97]"
        >
          이번 주
        </button>
      )}
    </div>
  );
}

function ArrowButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-container-lowest text-on-surface-variant shadow-tinted transition-all active:scale-[0.97] active:translate-y-0.5"
    >
      <span className="material-symbols-outlined text-2xl" aria-hidden>
        {icon}
      </span>
    </button>
  );
}
