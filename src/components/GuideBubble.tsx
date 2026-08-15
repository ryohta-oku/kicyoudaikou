import { cn } from "@/lib/utils";

/**
 * 次の一手を指し示す吹き出し。
 *
 * このアプリの誘導は「一画面に光るものは一つだけ」で成り立っている。
 * 吹き出しが同時に2つ出ていたら、それは条件の書き漏れ。
 *
 * 見た目だけを共通化し、**位置指定は呼び出し側が className で持つ**。
 * 位置まで抱え込むと props が肥大し、既存15箇所それぞれの微妙な
 * オフセット（left-6 / right-8 / 中央揃え…）を再現できずレイアウトが崩れる。
 */

type Arrow = "top" | "bottom" | "left" | "right";
type ArrowAlign = "start" | "center" | "end";
type Tone = "guide" | "strong" | "warn" | "error";

interface GuideBubbleProps {
  children: React.ReactNode;
  /** 三角の矢印を出す辺。吹き出しから見て、指し示す相手がいる方向 */
  arrow?: Arrow;
  /** 矢印の位置。上下の矢印なら左右方向、左右の矢印なら上下方向 */
  arrowAlign?: ArrowAlign;
  tone?: Tone;
  size?: "sm" | "md";
  /** 跳ねるアニメーションを付ける（既定: 付ける） */
  bounce?: boolean;
  /**
   * スクリーンリーダーに読み上げさせる。
   * **1画面につき主役の吹き出し1つだけに付けること。**
   * 複数の live region が同時に喋ると、かえって聞き取れなくなる。
   */
  announce?: boolean;
  /** 位置指定（例: "absolute top-full right-2 mt-3"） */
  className?: string;
  /** 矢印の位置を細かく調整したい場合の逃げ道 */
  arrowClassName?: string;
}

const TONE_BG: Record<Tone, string> = {
  guide: "bg-teal-600",
  strong: "bg-teal-700",
  warn: "bg-amber-500",
  error: "bg-red-500",
};

/** 矢印は「吹き出しの反対側の辺」から生やす */
const ARROW_POSITION: Record<Arrow, string> = {
  top: "bottom-full",
  bottom: "top-full",
  left: "right-full",
  right: "left-full",
};

const ARROW_COLOR: Record<Arrow, Record<Tone, string>> = {
  top: { guide: "border-b-teal-600", strong: "border-b-teal-700", warn: "border-b-amber-500", error: "border-b-red-500" },
  bottom: { guide: "border-t-teal-600", strong: "border-t-teal-700", warn: "border-t-amber-500", error: "border-t-red-500" },
  left: { guide: "border-r-teal-600", strong: "border-r-teal-700", warn: "border-r-amber-500", error: "border-r-red-500" },
  right: { guide: "border-l-teal-600", strong: "border-l-teal-700", warn: "border-l-amber-500", error: "border-l-red-500" },
};

function arrowAlignClass(arrow: Arrow, align: ArrowAlign): string {
  const horizontal = arrow === "top" || arrow === "bottom";
  if (horizontal) {
    if (align === "start") return "left-6";
    if (align === "end") return "right-6";
    return "left-1/2 -translate-x-1/2";
  }
  if (align === "start") return "top-2";
  if (align === "end") return "bottom-2";
  return "top-1/2 -translate-y-1/2";
}

export default function GuideBubble({
  children,
  arrow,
  arrowAlign = "center",
  tone = "guide",
  size = "md",
  bounce = true,
  announce = false,
  className,
  arrowClassName,
}: GuideBubbleProps) {
  return (
    <div
      {...(announce ? { role: "status", "aria-live": "polite" } : {})}
      className={cn(
        "whitespace-nowrap text-white font-medium shadow-lg z-10",
        TONE_BG[tone],
        size === "sm" ? "text-xs rounded-md px-2.5 py-1.5" : "text-sm rounded-full px-4 py-2",
        bounce && "animate-bounce",
        className
      )}
    >
      {children}
      {arrow && (
        <div
          aria-hidden="true"
          className={cn(
            "absolute border-8 border-transparent",
            ARROW_POSITION[arrow],
            ARROW_COLOR[arrow][tone],
            arrowClassName || arrowAlignClass(arrow, arrowAlign)
          )}
        />
      )}
    </div>
  );
}
