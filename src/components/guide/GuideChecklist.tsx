"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GuideStep } from "@/components/guide/content";

/**
 * 手順を1つずつ進めるチェックリスト。
 *
 * ## なぜ1つずつなのか
 *
 * 1章ぶんの手順（5〜7個）を縦に全部出すと、**いまどこをやっているのかが分からない**。
 * 利用者からの言葉:「1のところ押すと手順が出てくる。それが終わったら次2のところを押す」。
 *
 * 開くのは常に1つだけ。「できた」を押すと ☑ が付き、次の未チェックが自動で開く。
 * どこまでやったかが一目で分かり、中断しても戻れる。
 *
 * ## 途中経過の残し方
 *
 * `sessionStorage` に置く。**パネルを閉じても消えないため。**
 * 日をまたいで残す意味は無い（次はたいてい別のフォルダ）ので `localStorage` は使わない。
 */

function progressKey(scope: string, chapter: number): string {
  return `kicyou_guide_progress:${scope}:${chapter}`;
}

function readDone(scope: string, chapter: number): number[] {
  try {
    const raw = sessionStorage.getItem(progressKey(scope, chapter));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function writeDone(scope: string, chapter: number, done: number[]) {
  try {
    sessionStorage.setItem(progressKey(scope, chapter), JSON.stringify(done));
  } catch {
    // 使えなくても、その場のチェックは効く（覚えられないだけ）
  }
}

export default function GuideChecklist({
  steps,
  chapter,
  scope,
  onProgress,
}: {
  steps: GuideStep[];
  /** 章の番号。途中経過のキーに使う */
  chapter: number;
  /** どのフォルダの作業か。フォルダが変われば白紙に戻る */
  scope: string;
  /** 章の見出しに ☑ を出すために、全部終わったかを伝える */
  onProgress?: (allDone: boolean) => void;
}) {
  const [done, setDone] = useState<number[]>([]);
  const [openIndex, setOpenIndex] = useState(0);

  /* 開いたときに前回の続きを読む。読み込みは1回だけ */
  useEffect(() => {
    const saved = readDone(scope, chapter);
    setDone(saved);
    const next = steps.findIndex((_, i) => !saved.includes(i));
    setOpenIndex(next === -1 ? steps.length : next);
  }, [scope, chapter, steps]);

  useEffect(() => {
    onProgress?.(done.length >= steps.length && steps.length > 0);
  }, [done, steps.length, onProgress]);

  const allDone = steps.length > 0 && done.length >= steps.length;

  const complete = (index: number) => {
    const next = done.includes(index) ? done : [...done, index];
    setDone(next);
    writeDone(scope, chapter, next);
    // 次の未チェックへ自動で進む。無ければ全部閉じる
    const following = steps.findIndex((_, i) => !next.includes(i));
    setOpenIndex(following === -1 ? steps.length : following);
  };

  const undo = (index: number) => {
    const next = done.filter((n) => n !== index);
    setDone(next);
    writeDone(scope, chapter, next);
    setOpenIndex(index);
  };

  return (
    <div className="space-y-1.5">
      <ol className="space-y-1.5">
        {steps.map((step, i) => {
          const isDone = done.includes(i);
          const isOpen = openIndex === i;
          return (
            <li
              key={i}
              className={cn(
                "rounded-lg border transition-colors",
                isOpen
                  ? "border-teal-300 bg-teal-50/60"
                  : isDone
                    ? "border-green-200 bg-green-50/50"
                    : "border-gray-200 bg-white"
              )}
            >
              <button
                onClick={() => setOpenIndex(isOpen ? -1 : i)}
                className="w-full flex items-start gap-2 px-2.5 py-2 text-left"
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold shrink-0 mt-0.5",
                    isDone ? "bg-green-600 text-white" : "bg-teal-100 text-teal-800"
                  )}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-sm leading-relaxed min-w-0 flex-1",
                    isDone ? "text-gray-500 line-through" : "text-foreground"
                  )}
                >
                  {step.label}
                </span>
                {!isOpen && (
                  <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                )}
              </button>

              {isOpen && (
                <div className="px-2.5 pb-2.5 pl-9 space-y-2">
                  {step.detail && (
                    <div className="text-sm text-gray-700 leading-relaxed">{step.detail}</div>
                  )}
                  {isDone ? (
                    <button
                      onClick={() => undo(i)}
                      className="text-xs text-gray-500 hover:text-gray-800 underline"
                    >
                      まだできていない
                    </button>
                  ) : (
                    <button
                      onClick={() => complete(i)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium"
                    >
                      <Check className="w-4 h-4" />
                      できた
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {allDone && (
        <p className="flex items-center gap-1.5 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CircleCheck className="w-4 h-4 shrink-0" />
          この作業は終わりです。
        </p>
      )}
    </div>
  );
}
