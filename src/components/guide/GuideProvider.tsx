"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { GUIDE_CHAPTERS } from "@/components/guide/content";

/**
 * 説明の「いまどこ」を、画面ぜんたいで1つに持つ。
 *
 * ## なぜ必要か
 *
 * トップページのステップを押すと右のパネルにその章が出る ―― この形にすると、
 * **カードとパネルが別の場所にいるのに、同じ「いまどの章か」を見る**必要がある。
 * パネルが自分の中だけで持っていると、カードから指定できない。
 *
 * 進み具合（章ごとに手順を全部チェックしたか）も同じ理由でここに置く。
 * カードの ☑ と、パネルの「次のステップへ」が、同じ数字を見る。
 *
 * ## 覚え方
 *
 * `sessionStorage` に置く。**タブを閉じれば消える** ―― 次の束の作業は
 * 白紙から始まるのが自然で、日をまたいで残す意味がない。
 * それとは別に「最初から」で手でも消せるようにする（1日に2束やるとき用）。
 */

/** どの作業のぶんか。フォルダごとに分ける */
export function progressKey(scope: string, chapter: number): string {
  return `kicyou_guide_progress:${scope}:${chapter}`;
}

export function readChapterDone(scope: string, chapter: number): number[] {
  try {
    const raw = sessionStorage.getItem(progressKey(scope, chapter));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

interface GuideContextValue {
  /** いま開いている章の番号。null なら閉じている */
  openedChapter: number | null;
  open: (chapter: number) => void;
  close: () => void;
  /** 手順を全部チェックし終わった章の番号 */
  doneChapters: number[];
  /** チェックリストが sessionStorage を書いたあとに呼ぶ */
  refresh: () => void;
  /** 「最初から」。その作業ぶんの進み具合を全部消す */
  reset: (scope: string) => void;
  /** いま見ている作業のぶん（フォルダIDか "dashboard"） */
  scope: string;
  setScope: (scope: string) => void;
}

const GuideContext = createContext<GuideContextValue | null>(null);

export function useGuide(): GuideContextValue {
  const ctx = useContext(GuideContext);
  if (!ctx) throw new Error("useGuide は GuideProvider の中でだけ使えます");
  return ctx;
}

export default function GuideProvider({ children }: { children: React.ReactNode }) {
  const [openedChapter, setOpenedChapter] = useState<number | null>(null);
  const [scope, setScope] = useState("dashboard");
  /** 数えなおしの合図。増やすと doneChapters を計算し直す */
  const [tick, setTick] = useState(0);

  const doneChapters = useMemo(() => {
    if (typeof window === "undefined") return [];
    // tick を読むことで、チェックのたびに数え直す
    void tick;
    return GUIDE_CHAPTERS.filter((c) => {
      const total = c.steps?.length ?? 0;
      if (total === 0) return false;
      return readChapterDone(scope, c.step).length >= total;
    }).map((c) => c.step);
  }, [scope, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const reset = useCallback((target: string) => {
    try {
      for (const c of GUIDE_CHAPTERS) {
        sessionStorage.removeItem(progressKey(target, c.step));
      }
    } catch {
      // 使えなくても、画面上は数え直しで白紙になる
    }
    setTick((n) => n + 1);
  }, []);

  /*
    **`close` は毎回作り直さない。**

    パネルは「画面が変わったら閉じる」を後片付けで書いている。
    ここで毎回新しい関数を渡すと、章を開いた瞬間に value が作り直され、
    その後片付けが走って**開いた直後に閉じてしまう**（実際そうなっていた）。
  */
  const close = useCallback(() => setOpenedChapter(null), []);

  const value = useMemo<GuideContextValue>(
    () => ({
      openedChapter,
      open: setOpenedChapter,
      close,
      doneChapters,
      refresh,
      reset,
      scope,
      setScope,
    }),
    [openedChapter, doneChapters, refresh, reset, scope, close]
  );

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}
