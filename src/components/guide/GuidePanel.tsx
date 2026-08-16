"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { BookOpen, X, ExternalLink, ArrowRight, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEffectiveRole } from "@/lib/roleSimulation";
import {
  computeCurrentStep,
  extractFolderId,
  GUIDE_FOR_DASHBOARD,
  GUIDE_FOR_STEP,
  STEP_LABELS,
} from "@/lib/workflow-step";
import { chapterByStep } from "@/components/guide/content";
import { Note, Tip, Trouble } from "@/components/guide/GuideParts";
import GuideChecklist from "@/components/guide/GuideChecklist";
import { useGuide } from "@/components/guide/GuideProvider";
import { useFolderStep } from "@/components/guide/useFolderStep";

/**
 * いまやっている作業の「やり方」を、作業画面の横に出す。
 *
 * ## 出すのは1章だけ
 *
 * どの章を出すかは**外から決まる** ―― トップページのステップを押したときは
 * その章、作業画面ではいまの工程に対応する章。
 * パネル自身が章を並べて選ばせる必要はない（以前はアコーディオンにしていたが、
 * 入口がトップのステップになって役目が消えた）。
 *
 * ## 終わったら次へ
 *
 * 手順を全部チェックすると「次のステップへ →」が出る。
 * 利用者の言う「終わったら次2に進む、3に進む」が、そのまま操作になる。
 */

/** 見た工程を覚えておく。**人ごとに分ける** ―― 現場ではパソコンを共有する */
function seenKey(userId: string | undefined): string {
  return `kicyou_guide_seen:${userId || "anon"}`;
}

function readSeen(userId: string | undefined): string[] {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function markSeen(userId: string | undefined, step: string) {
  try {
    const list = readSeen(userId);
    if (list.includes(step)) return;
    localStorage.setItem(seenKey(userId), JSON.stringify([...list, step]));
  } catch {
    // localStorage が使えなくても、パネル自体は使える（毎回開くだけ）
  }
}

/** 空の配列を使い回す（毎回作ると副作用の依存が変わる） */
const EMPTY: number[] = [];

/** 説明を出さない画面。税理士の確認画面は読む相手が違う */
function isHiddenPath(pathname: string): boolean {
  return (
    pathname.startsWith("/review") ||
    pathname.startsWith("/guide") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/setup-password") ||
    pathname.startsWith("/admin")
  );
}

export default function GuidePanel() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { openedChapter, open, close, doneChapters, scope, setScope } = useGuide();

  const userId = session?.user?.id;
  const role = session?.user?.role ? getEffectiveRole(session.user.role as string) : null;
  const isTypeB = role === "user_b";
  const folderId = extractFolderId(pathname);
  const folderInfo = useFolderStep(folderId, pathname);

  /* 進み具合を覚える単位。フォルダが変われば白紙から始まる */
  useEffect(() => {
    setScope(folderId ?? "dashboard");
  }, [folderId, setScope]);

  const currentStep = folderId
    ? folderInfo
      ? computeCurrentStep(folderInfo, isTypeB, pathname)
      : null
    : "dashboard";

  /**
   * この画面で出しうる章。トップは①〜④、作業画面はその工程のもの。
   * **毎回新しい配列を作らない** ―― 下の副作用の依存に入るので、
   * 作り直すたびに走ってしまう。
   */
  const allowed = useMemo(
    () =>
      currentStep === "dashboard"
        ? GUIDE_FOR_DASHBOARD
        : currentStep
          ? GUIDE_FOR_STEP[currentStep] ?? EMPTY
          : EMPTY,
    [currentStep]
  );

  /*
    **初めてその工程に来たときだけ開く。** 2回目からは閉じたまま。
    工程が決まるのは読み込みのあと（フォルダの状態を待つ）ので、副作用で書く。
  */
  const autoOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!currentStep || allowed.length === 0) return;
    if (autoOpened.current === currentStep) return;
    autoOpened.current = currentStep;
    if (!readSeen(userId).includes(currentStep)) open(allowed[0]);
  }, [currentStep, allowed, userId, open]);

  /* 画面が変わったら、前の画面の章を出したままにしない */
  useEffect(() => {
    return () => close();
  }, [pathname, close]);

  /*
    本文を押しのける。**印はここで付ける** ―― パネルは fixed なので、
    自分が出たことを本文に伝える手立てが他にない。
    幅の指定は globals.css の `body.guide-open` にある。
  */
  const isOpen = openedChapter !== null && allowed.includes(openedChapter);
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add("guide-open");
    return () => document.body.classList.remove("guide-open");
  }, [isOpen]);

  const closePanel = () => {
    close();
    if (currentStep) markSeen(userId, currentStep);
  };

  if (status !== "authenticated") return null;
  if (isHiddenPath(pathname)) return null;
  if (allowed.length === 0) return null;

  const chapter = isOpen ? chapterByStep(openedChapter!) : null;
  const stepLabel = currentStep && currentStep !== "dashboard" ? STEP_LABELS[currentStep] : null;
  const chapterDone = chapter ? doneChapters.includes(chapter.step) : false;
  /** 次に進む先。この画面で出せる章の中にあるときだけ */
  const nextChapter =
    chapter && allowed.includes(chapter.step + 1) ? chapterByStep(chapter.step + 1) : null;
  /* ④はフォルダを開かないとできない。トップから押されたときは行き先を出す */
  const needsFolder = chapter ? chapter.step >= 4 && !folderId : false;

  return (
    <>
      {/*
        開閉ボタンは**左下**。右下はフォルダ画面のCSVエクスポートが
        使っている（fixed bottom-6 right-6 z-40）ので、ぶつけない。
      */}
      {!isOpen && (
        <button
          onClick={() => open(allowed[0])}
          className="app-chrome fixed bottom-6 left-6 z-30 inline-flex items-center gap-2 px-4 py-3 bg-white border-2 border-teal-300 text-teal-800 rounded-full shadow-lg hover:bg-teal-50 transition-colors font-bold"
        >
          <BookOpen className="w-5 h-5" />
          やり方
        </button>
      )}

      {isOpen && chapter && (
        <>
          {/* 画面が狭いときは全画面になるので、後ろを暗くして迷わせない */}
          <div
            onClick={closePanel}
            className="app-chrome fixed inset-0 z-40 bg-black/30 lg:hidden"
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="やり方"
            className={cn(
              "app-chrome fixed z-40 bg-white shadow-2xl flex flex-col",
              "inset-x-0 bottom-0 top-16 rounded-t-2xl",
              /* `inset-x-0` が left:0 も入れるので、`lg:left-auto` が要る */
              "lg:top-0 lg:left-auto lg:right-0 lg:h-full lg:w-[22rem] lg:border-l lg:border-teal-100 lg:rounded-none"
            )}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-teal-100 bg-teal-50/70 shrink-0">
              <div className="min-w-0">
                <p className="font-black text-foreground">やり方</p>
                <p className="text-xs text-teal-800 truncate">
                  {stepLabel ? `いま：${stepLabel}` : `ステップ ${chapter.step}`}
                </p>
              </div>
              <button
                onClick={closePanel}
                aria-label="閉じる"
                className="p-2 -mr-2 text-gray-500 hover:text-gray-800 hover:bg-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              <h2 className="flex items-center gap-2 font-black text-foreground">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-teal-600 text-white text-sm shrink-0">
                  {chapter.step}
                </span>
                <chapter.icon className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="min-w-0">{chapter.title}</span>
              </h2>

              {chapter.lead && (
                <p className="text-sm text-foreground leading-relaxed">{chapter.lead}</p>
              )}

              {/*
                ④以降はフォルダの中の作業。トップから開いたときは、
                **どこへ行けばできるのか**を先に出す。手順だけ読ませても進めない。
              */}
              {needsFolder && (
                <Link
                  href="/"
                  onClick={closePanel}
                  className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 hover:bg-amber-100 transition-colors"
                >
                  <FolderOpen className="w-4 h-4 shrink-0" />
                  <span>
                    ここから先は<strong>フォルダを開いて</strong>から。下の一覧から選んでください
                  </span>
                </Link>
              )}

              {chapter.steps && (
                <GuideChecklist steps={chapter.steps} chapter={chapter.step} scope={scope} />
              )}

              {chapter.notes?.map((n, i) => <Note key={i} compact>{n}</Note>)}
              {chapter.tips?.map((t, i) => <Tip key={i} compact>{t}</Tip>)}
              {chapter.troubles && <Trouble items={chapter.troubles} collapsible />}
            </div>

            <div className="border-t border-gray-200 px-4 py-3 shrink-0 flex items-center justify-between gap-2">
              <Link
                href={`/guide#step-${chapter.step}`}
                className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900"
              >
                <ExternalLink className="w-4 h-4" />
                説明書を全部見る
              </Link>

              {/* 終わったら次へ。利用者の「終わったら次2に進む」がそのまま操作になる */}
              {chapterDone && nextChapter && (
                <button
                  onClick={() => open(nextChapter.step)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold"
                >
                  次のステップへ
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}
