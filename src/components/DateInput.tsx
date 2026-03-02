"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  parse,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
} from "date-fns";
import { ja } from "date-fns/locale";
import { cn } from "@/lib/utils";

function parseDateValue(value: string): Date | null {
  if (!value) return null;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
}

/** 値が YYYY-MM-DD 形式の有効な日付かチェック */
export function isValidDateValue(value: string): boolean {
  if (!value) return false;
  return parseDateValue(value) !== null;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

export default function DateInput({
  value,
  onChange,
  disabled = false,
  placeholder = "YYYY-MM-DD",
  className,
  onOpenChange,
}: DateInputProps) {
  const [isOpen, setIsOpen] = useState(false);

  // カレンダー開閉時に親に通知
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);
  const [displayMonth, setDisplayMonth] = useState<Date>(() => {
    const parsed = parseDateValue(value);
    return parsed ? startOfMonth(parsed) : startOfMonth(new Date());
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLDivElement>(null);

  // 入力値が有効な日付に変わったらカレンダーの表示月を同期
  useEffect(() => {
    const parsed = parseDateValue(value);
    if (parsed) {
      setDisplayMonth(startOfMonth(parsed));
    }
  }, [value]);

  // カレンダー外クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Escape で閉じる
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleDayClick = useCallback(
    (day: Date) => {
      onChange(format(day, "yyyy-MM-dd"));
      setIsOpen(false);
    },
    [onChange]
  );

  const handleTodayClick = useCallback(() => {
    const today = new Date();
    onChange(format(today, "yyyy-MM-dd"));
    setDisplayMonth(startOfMonth(today));
    setIsOpen(false);
  }, [onChange]);

  const selectedDate = parseDateValue(value);

  // カレンダーの日付グリッドを生成
  const monthStart = startOfMonth(displayMonth);
  const monthEnd = endOfMonth(displayMonth);
  const calendarStart = startOfWeek(monthStart, { locale: ja });
  const calendarEnd = endOfWeek(monthEnd, { locale: ja });

  const days: Date[] = [];
  let cursor = calendarStart;
  while (cursor <= calendarEnd) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return (
    <div ref={containerRef} className={cn("relative flex-1", className)}>
      <div className="flex items-center gap-1.5">
        {!disabled && (
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
            tabIndex={-1}
          >
            <CalendarDays className="w-4 h-4" />
          </button>
        )}
        <div
          ref={inputRef}
          onClick={() => { if (!disabled) setIsOpen(true); }}
          className={cn(
            "w-full px-3 py-2 border rounded-lg text-sm min-h-[38px]",
            disabled
              ? "bg-gray-50 text-gray-500"
              : "cursor-pointer hover:border-teal-400 transition-colors",
            isOpen && "ring-2 ring-teal-500 border-teal-500"
          )}
        >
          {value ? (
            <span className="text-gray-900">{value}</span>
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-[280px] animate-in fade-in slide-in-from-top-1 duration-150">
          {/* ヘッダー: 月ナビゲーション */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setDisplayMonth((m) => subMonths(m, 1))}
              className="p-1 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-gray-800">
              {format(displayMonth, "yyyy年 M月", { locale: ja })}
            </span>
            <button
              type="button"
              onClick={() => setDisplayMonth((m) => addMonths(m, 1))}
              className="p-1 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((wd, i) => (
              <div
                key={wd}
                className={cn(
                  "text-center text-[11px] font-medium py-1",
                  i === 0 && "text-red-400",
                  i === 6 && "text-blue-400",
                  i > 0 && i < 6 && "text-gray-400"
                )}
              >
                {wd}
              </div>
            ))}
          </div>

          {/* 日付グリッド */}
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const inMonth = isSameMonth(day, displayMonth);
              const selected = selectedDate && isSameDay(day, selectedDate);
              const today = isToday(day);
              const dayOfWeek = day.getDay();

              if (!inMonth) {
                return (
                  <div
                    key={day.toISOString()}
                    className="w-full aspect-square flex items-center justify-center text-[12px] text-gray-200"
                  >
                    {day.getDate()}
                  </div>
                );
              }

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "w-full aspect-square flex items-center justify-center text-[12px] rounded-lg transition-colors",
                    selected
                      ? "bg-teal-600 text-white font-bold"
                      : today
                        ? "bg-teal-50 ring-1 ring-teal-300 font-medium"
                        : "hover:bg-gray-100",
                    !selected && dayOfWeek === 0 && "text-red-500",
                    !selected && dayOfWeek === 6 && "text-blue-500",
                    !selected && !today && dayOfWeek > 0 && dayOfWeek < 6 && "text-gray-700"
                  )}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {/* 今日ボタン */}
          <button
            type="button"
            onClick={handleTodayClick}
            className="mt-2 w-full text-xs text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded-md py-1.5 transition-colors font-medium"
          >
            今日を選択
          </button>
        </div>
      )}
    </div>
  );
}
