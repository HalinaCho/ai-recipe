"use client";

import type { MealPlanSlot } from "@/types/api";
import { cn } from "@/lib/utils";
import { formatDayLabel } from "./format";
import { MealSlotCard } from "./MealSlotCard";
import { dayOfWeek } from "./week";

export interface MealPlanDayCardProps {
  date: string;
  slots: MealPlanSlot[];
  isToday: boolean;
  onSwap: (slot: MealPlanSlot) => void;
}

/**
 * 하루치 묶음 (FR-11-01).
 *
 * 끼니 수가 요일마다 다른 게 이 화면의 핵심이라, 날짜 줄에 왜 다른지를 같이
 * 적는다 — 공휴일이면 이름 배지, 주말이면 요일 색으로 구분된다.
 */
export function MealPlanDayCard({
  date,
  slots,
  isToday,
  onSwap,
}: MealPlanDayCardProps) {
  const holidayName = slots.find((slot) => slot.holidayName)?.holidayName ?? null;
  const isHoliday = slots.some((slot) => slot.isHoliday);
  const weekend = dayOfWeek(date) === 0 || dayOfWeek(date) === 6;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <h3
          className={cn(
            "text-label-md",
            isHoliday || weekend ? "text-error" : "text-on-surface",
          )}
        >
          {formatDayLabel(date)}
        </h3>

        {isToday && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-label-sm text-on-primary">
            오늘
          </span>
        )}

        {holidayName && (
          <span className="rounded-full bg-error-container px-2 py-0.5 text-label-sm text-on-error-container">
            {holidayName}
          </span>
        )}

        {slots.length > 1 && (
          <span className="text-label-sm text-on-surface-variant">
            {holidayName ? "공휴일이라" : "주말이라"} 점심까지 챙겼어요
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {slots.map((slot) => (
          <li key={slot.id}>
            <MealSlotCard slot={slot} onSwap={() => onSwap(slot)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
