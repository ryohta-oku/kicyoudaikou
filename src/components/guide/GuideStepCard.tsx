"use client";

import Link from "next/link";
import { BookOpen, Check, RotateCcw, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { GUIDE_CHAPTERS } from "@/components/guide/content";
import { useGuide } from "@/components/guide/GuideProvider";
import { GUIDE_FOR_DASHBOARD } from "@/lib/workflow-step";

/**
 * トップページの「紙の書類をパソコンに入れる流れ」。
 *
 * ## これが進行管理そのもの
 *
 * 以前は説明書へのリンクが4つ並んでいるだけの飾りだった。
 * 利用者が想像していたのは違った ――
 *
 * > ステップを押すとやり方が右のスライドで出てくる。終わったら次2に進む、3に進む。
 * > **トップページに現状が出る**
 *
 * なので、ここが「いまどこまでやったか」を持つ場所になる。
 * 押すと右のパネルにその章のやり方が出て、手順を全部チェックすると ☑ が付き、
 * 次のステップが「いまここ」になる。
 *
 * ## 題名は説明書から取る
 *
 * **文言を2か所に書かない。** 以前はここに独自の言葉を書いていて、
 * 「Step 4 あとは吹き出しの通りに進める」が説明書の「④読み取った文字を確かめる」を
 * 指すという、**同じ番号が2つの意味を持つ**状態になっていた。
 */
export default function GuideStepCard({
  /** 取り込み済みか。**Step 3 だけはシステムが終わったかどうかを知っている** */
  uploadedToday,
  /** 「画像をこの画面に入れる」を押したときに、アップロード欄を開く */
  onStartUpload,
}: {
  uploadedToday: boolean;
  onStartUpload: () => void;
}) {
  const { open, doneChapters, reset, scope } = useGuide();

  const chapters = GUIDE_FOR_DASHBOARD.map((n) =>
    GUIDE_CHAPTERS.find((c) => c.step === n)
  ).filter((c): c is NonNullable<typeof c> => !!c);

  /** 終わったとみなす章。③は今日フォルダができていれば自動で付く */
  const isDone = (step: number) =>
    doneChapters.includes(step) || (step === 3 && uploadedToday);

  /** いまここ＝最初の未完了 */
  const current = chapters.find((c) => !isDone(c.step))?.step ?? null;
  const allDone = current === null;

  return (
    <div className="card-glass rounded-xl p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-base font-semibold text-foreground">
          紙の書類をパソコンに入れる流れ
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {doneChapters.length > 0 && (
            <button
              onClick={() => reset(scope)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              最初から
            </button>
          )}
          <Link
            href="/guide"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            はじめての方へ（くわしい手順）
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
        {chapters.map((c) => {
          const done = isDone(c.step);
          const now = current === c.step;
          const Icon = c.icon;

          return (
            <button
              key={c.step}
              type="button"
              onClick={() => {
                open(c.step);
                // ③は「実際に入れる」画面も一緒に開ける。説明だけ読んでも進まない
                if (c.step === 3) onStartUpload();
              }}
              className={cn(
                "flex flex-col items-center text-center gap-1.5 p-2.5 md:p-3 rounded-lg border-2 transition-colors",
                now
                  ? "border-teal-500 bg-teal-50 shadow-sm"
                  : done
                    ? "border-green-200 bg-green-50/60 hover:bg-green-50"
                    : "border-transparent bg-teal-50/40 hover:bg-teal-100"
              )}
            >
              <div
                className={cn(
                  "w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0",
                  done ? "bg-green-600" : now ? "bg-teal-600" : "bg-teal-100"
                )}
              >
                {done ? (
                  <Check className="w-5 h-5 text-white" />
                ) : (
                  <Icon className={cn("w-5 h-5", now ? "text-white" : "text-teal-600")} />
                )}
              </div>

              <div className="min-w-0">
                <span
                  className={cn(
                    "text-xs font-bold",
                    done ? "text-green-700" : "text-teal-600"
                  )}
                >
                  Step {c.step}
                </span>
                <p className="text-xs md:text-sm text-gray-800 mt-0.5 leading-snug">
                  {c.title}
                </p>
              </div>

              <span
                className={cn(
                  "text-[11px] leading-tight",
                  now ? "text-teal-800 font-bold" : "text-gray-500"
                )}
              >
                {now
                  ? "← いまここ"
                  : done
                    ? "終わりました"
                    : c.step >= 4
                      ? "フォルダを開いてから"
                      : "やり方を見る"}
              </span>
            </button>
          );
        })}
      </div>

      {/* 全部終わったときだけ、次にやることを1つだけ出す */}
      {allDone && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <Check className="w-4 h-4 shrink-0" />
          ここまで終わりました。下の一覧からフォルダを開いて、続きを進めてください。
        </p>
      )}

      {/* 取り込みの入口は、説明とは別に常に押せるようにしておく */}
      {!uploadedToday && (
        <button
          onClick={onStartUpload}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900"
        >
          <Upload className="w-4 h-4" />
          いますぐ画像を入れる
        </button>
      )}
    </div>
  );
}
