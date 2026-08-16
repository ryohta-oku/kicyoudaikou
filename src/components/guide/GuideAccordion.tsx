"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GuideChapter } from "@/components/guide/content";
import { Note, Tip, Trouble } from "@/components/guide/GuideParts";
import GuideChecklist from "@/components/guide/GuideChecklist";

/**
 * パネルの中で、章を1つずつ開く。
 *
 * ## なぜ畳むのか
 *
 * ダッシュボードでは章が3つ（レシートをそろえる／スキャン／取り込み）出る。
 * 全部開いたままだと縦に長く積まれ、**スクロールしないと②が見えない**。
 * 利用者からの言葉:「1のところ押すと手順が出てくる。それが終わったら次2のところを押す」。
 *
 * **章が1つだけのときは畳まない。** 作業画面のほとんどはこれで、
 * 開くための一手間を増やす意味がない。
 */
export default function GuideAccordion({
  chapters,
  scope,
}: {
  chapters: GuideChapter[];
  /** どのフォルダの作業か。手順のチェックを覚えるキーに使う */
  scope: string;
}) {
  const single = chapters.length === 1;
  const [openStep, setOpenStep] = useState<number>(chapters[0]?.step ?? 0);
  /** 章ごとに「全部終わったか」。見出しの ☑ に使う */
  const [finished, setFinished] = useState<Record<number, boolean>>({});

  return (
    <div className={single ? "" : "space-y-2"}>
      {chapters.map((c) => {
        const isOpen = single || openStep === c.step;
        const isDone = !!finished[c.step];

        return (
          <section
            key={c.step}
            id={`step-${c.step}`}
            className={cn(
              !single && "rounded-xl border",
              !single && (isOpen ? "border-teal-300" : isDone ? "border-green-200" : "border-gray-200")
            )}
          >
            {/* 章が1つだけなら、畳む操作を出さない */}
            {single ? (
              <h2 className="flex items-center gap-2 mb-3 font-black text-foreground">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-teal-600 text-white text-sm shrink-0">
                  {c.step}
                </span>
                <c.icon className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="min-w-0">{c.title}</span>
              </h2>
            ) : (
              <button
                onClick={() => setOpenStep(isOpen ? -1 : c.step)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-xl transition-colors",
                  isOpen ? "bg-teal-50/70" : "hover:bg-gray-50"
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-black shrink-0",
                    isDone ? "bg-green-600 text-white" : "bg-teal-600 text-white"
                  )}
                >
                  {isDone ? <Check className="w-4 h-4" /> : c.step}
                </span>
                <span className="font-bold text-foreground min-w-0 flex-1">{c.title}</span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-gray-400 shrink-0 transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </button>
            )}

            {isOpen && (
              <div className={cn("space-y-3", !single && "px-3 pb-3")}>
                {c.lead && <p className="text-sm text-foreground leading-relaxed">{c.lead}</p>}

                {c.steps && (
                  <GuideChecklist
                    steps={c.steps}
                    chapter={c.step}
                    scope={scope}
                    onProgress={(allDone) =>
                      setFinished((prev) =>
                        prev[c.step] === allDone ? prev : { ...prev, [c.step]: allDone }
                      )
                    }
                  />
                )}

                {/* 手順に結びつかない、章ぜんたいの注意 */}
                {c.notes?.map((n, i) => <Note key={i} compact>{n}</Note>)}
                {c.tips?.map((t, i) => <Tip key={i} compact>{t}</Tip>)}
                {c.troubles && <Trouble items={c.troubles} collapsible />}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
