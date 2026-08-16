import { AlertTriangle, Lightbulb, HelpCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 説明を描くための部品。
 *
 * **説明書のページと、作業画面の横に出すパネルの両方がこれを使う。**
 * 片方だけ見た目が古くなることが起きないよう、描き方は1か所に持つ。
 *
 * 呼び出し側が `compact` を渡すと、パネル用に一回り小さくなる。
 * 中身は同じで、余白と文字の大きさだけが変わる。
 */

export interface GuideTrouble {
  q: string;
  a: React.ReactNode;
}

/** 章のまとまり。番号・見出し・中身をひとつにする */
export function Section({
  step,
  title,
  icon: Icon,
  compact,
  children,
}: {
  step: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`step-${step}`}
      className={cn(
        "scroll-mt-24",
        compact ? "" : "card-glass rounded-xl p-5 md:p-6"
      )}
    >
      <div className={cn("flex items-start gap-3", compact ? "mb-3" : "mb-4")}>
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-teal-600 text-white font-black shrink-0",
            compact ? "w-7 h-7 text-sm" : "w-10 h-10 text-lg"
          )}
        >
          {step}
        </span>
        <h2
          className={cn(
            "font-black text-foreground flex items-center gap-2 min-w-0",
            compact ? "text-base" : "text-xl md:text-2xl"
          )}
        >
          <Icon className={cn("text-teal-600 shrink-0", compact ? "w-4 h-4" : "w-5 h-5")} />
          {title}
        </h2>
      </div>
      <div className={compact ? "space-y-3" : "space-y-4"}>{children}</div>
    </section>
  );
}

/**
 * やること。**1行に1つの動作**しか書かない。
 *
 * ここは**説明書のページ用で、全部開いたまま**出す（読み通す・紙に印刷するため）。
 * 作業中に1つずつ開くのは `GuideChecklist` の役目。
 */
export function Steps({ items }: { items: GuideStepLike[] }) {
  return (
    <ol className="space-y-3">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="inline-flex items-center justify-center rounded-full bg-teal-100 text-teal-800 font-bold shrink-0 mt-0.5 w-6 h-6 text-sm">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-foreground leading-relaxed">{t.label}</p>
            {t.detail && (
              <p className="text-sm text-gray-600 leading-relaxed mt-1">{t.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** `content.tsx` の `GuideStep` と同じ形。循環参照を避けるためここにも置く */
export interface GuideStepLike {
  label: React.ReactNode;
  detail?: React.ReactNode;
}

/**
 * 気をつけること。
 * **赤ではなく琥珀にする** ―― できないことではなく、注意なので。
 */
export function Note({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex gap-2.5 bg-amber-50 border border-amber-200 rounded-lg", compact ? "p-2.5" : "p-3")}>
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="text-sm text-amber-900 leading-relaxed">{children}</div>
    </div>
  );
}

/** 知っていると楽になること */
export function Tip({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex gap-2.5 bg-teal-50 border border-teal-200 rounded-lg", compact ? "p-2.5" : "p-3")}>
      <Lightbulb className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
      <div className="text-sm text-teal-900 leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * こまったとき。
 * **その作業のすぐ横に置く。** 巻末にまとめると、そこまでたどり着けない。
 *
 * `collapsible` を渡すと、見出しを押したときだけ開く（作業中のパネル用）。
 * **困っていないときに読む文章ではない**ので、いつも開いていると邪魔になる。
 * 説明書のページでは畳まない（紙に出ないため）。
 */
export function Trouble({ items, collapsible }: { items: GuideTrouble[]; collapsible?: boolean }) {
  const body = (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.q}>
          <p className="text-sm font-bold text-foreground">{it.q}</p>
          <p className="text-sm text-gray-700 leading-relaxed mt-0.5">{it.a}</p>
        </div>
      ))}
    </div>
  );

  if (!collapsible) {
    return (
      <div className="border-t border-gray-200 pt-3 space-y-3">
        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-gray-400" />
          こまったとき
        </h3>
        {body}
      </div>
    );
  }

  return (
    <details className="border-t border-gray-200 pt-3 group">
      <summary className="text-sm font-bold text-gray-700 flex items-center gap-1.5 cursor-pointer list-none">
        <HelpCircle className="w-4 h-4 text-gray-400 shrink-0" />
        こまったとき（{items.length}件）
        <ChevronDown className="w-4 h-4 text-gray-400 ml-auto transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3">{body}</div>
    </details>
  );
}

/**
 * 事業所で埋めるところ。
 * **印刷しても分かる形にする** ―― 埋めないまま配ると、そこで手が止まる。
 */
export function ToConfirm({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-2 border-dashed border-gray-300 bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
      <span className="font-bold text-gray-800">【事業所で確かめて書き足すところ】</span>
      <div className="mt-1 leading-relaxed">{children}</div>
    </div>
  );
}
