"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderPdfPage, cancelPdfRender } from "@/lib/pdf-render";

/**
 * PDFの指定ページを画像として出す。
 *
 * **画面に入るまで描かない。** 仕訳が50件並ぶと、そのぶんPDFを描くことになる。
 * 見えていない行まで先に描くと、開いた瞬間に固まる。
 */
export default function PdfPageCanvas({
  src,
  pageNumber,
  maxWidth,
  className,
  label,
}: {
  /** PDF本体のURL（`#page=` は付けない） */
  src: string;
  pageNumber: number;
  maxWidth: number;
  className?: string;
  /** 読めなかったときに出す説明 */
  label?: string;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"waiting" | "drawing" | "done" | "failed">("waiting");

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    let cancelled = false;
    let started = false;

    const draw = async () => {
      if (cancelled || started || !canvasRef.current) return;
      started = true;
      setState("drawing");
      try {
        await renderPdfPage(src, pageNumber, canvasRef.current, maxWidth);
        if (!cancelled) setState("done");
      } catch (err) {
        console.error("PDFを描けませんでした", err);
        if (!cancelled) setState("failed");
      }
    };

    /*
      画面に入っているかを**自分で測る。**

      最初は IntersectionObserver だけで判定していたが、
      **発火しない環境がある**（描画されていないタブや埋め込みブラウザ）。
      そこでは仕訳のレシートが永久に出ないままになる。
      見えているかどうかは矩形を測れば分かるので、そちらを主にする。

      少し手前（200px）から描き始めるのは、スクロールしてから待たされないため。
    */
    const near = () => {
      const r = holder.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false; // 隠れている（拡大表示など）
      return r.bottom > -200 && r.top < window.innerHeight + 200;
    };

    const check = () => {
      if (near()) {
        cleanup();
        draw();
      }
    };

    const cleanup = () => {
      window.removeEventListener("scroll", check, true);
      window.removeEventListener("resize", check);
    };

    if (near()) {
      draw();
    } else {
      // 見えていないものは、スクロールしてきたときに描く
      window.addEventListener("scroll", check, true);
      window.addEventListener("resize", check);
    }

    return () => {
      cancelled = true;
      cleanup();
      // 描きかけを残さない（Strict Mode の2回目と衝突させない）
      if (canvasRef.current) cancelPdfRender(canvasRef.current);
    };
  }, [src, pageNumber, maxWidth]);

  return (
    <div ref={holderRef} className={cn("relative flex items-center justify-center", className)}>
      <canvas ref={canvasRef} className={state === "done" ? "block" : "hidden"} />

      {state !== "done" && (
        <div className="flex flex-col items-center gap-1 text-gray-400">
          {state === "failed" ? (
            <>
              <FileText className="w-6 h-6 text-teal-600" />
              <span className="text-[10px] text-center leading-tight">
                {label ?? `PDF ${pageNumber}ページ`}
              </span>
            </>
          ) : (
            <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
          )}
        </div>
      )}
    </div>
  );
}
