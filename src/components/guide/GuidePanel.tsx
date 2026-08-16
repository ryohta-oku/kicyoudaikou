"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { BookOpen, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEffectiveRole } from "@/lib/roleSimulation";
import {
  computeCurrentStep,
  extractFolderId,
  GUIDE_FOR_DASHBOARD,
  GUIDE_FOR_STEP,
  STEP_LABELS,
  type FolderInfo,
} from "@/lib/workflow-step";
import { chapterByStep } from "@/components/guide/content";
import GuideAccordion from "@/components/guide/GuideAccordion";

/**
 * いまやっている作業の説明を、作業画面の横に出す。
 *
 * ## なぜ作ったか
 *
 * 説明書（`/guide`）は8章を1ページに並べてある。中身は足りているが、
 * **作業の途中で読むには向かない** ―― 画面を離れ、長いページから該当箇所を探し、
 * 読んで、また戻る。1回の確認ごとにこれが起きていた。
 *
 * 「次にどこを押すか」は `GuideBubble` が指している。
 * **足りていなかったのは「なぜ・どう見るか」**で、それは説明書が持っていたのに
 * 別の部屋にあった。ここでつなぐ。
 *
 * ## 中身は持たない
 *
 * 文章は `components/guide/content.tsx` の1か所だけ。説明書のページと同じものを
 * 同じ部品（`GuideParts`）で描く。片方だけ古くなることが起きない。
 *
 * ## どの章を出すか
 *
 * 工程バーがすでに計算している工程IDに紐づける（`lib/workflow-step.ts`）。
 * **新しい判定は書かない。**
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
  /**
   * **どの工程のぶんを開いているか**を持つ（真偽値ではなく工程ID）。
   * 工程が変われば `open` は自然に false になるので、
   * 「画面が変わったら閉じる」ための副作用が要らない。
   */
  const [openStep, setOpenStep] = useState<string | null>(null);
  /** 取ってきたフォルダの状態。どのフォルダのものかを一緒に持つ */
  const [loaded, setLoaded] = useState<{ folderId: string; info: FolderInfo } | null>(null);

  const userId = session?.user?.id;
  const role = session?.user?.role ? getEffectiveRole(session.user.role as string) : null;
  const isTypeB = role === "user_b";
  const folderId = extractFolderId(pathname);

  /*
    フォルダの状態は**1回だけ**取る。工程バーは3秒ごとに取り直しているが、
    こちらは説明文を選ぶだけなので、鮮度は要らない。
  */
  useEffect(() => {
    if (!folderId) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/folders/${folderId}`);
        if (!res.ok || !alive) return;
        const data = await res.json();
        if (!data.folder || !alive) return;
        setLoaded({
          folderId,
          info: {
            handoffStatus: data.folder.handoffStatus || null,
            doubleCheckStatus: data.folder.doubleCheckStatus || null,
            needsDoubleCheck: data.folder.needsDoubleCheck || false,
            taxReviewStatus: data.folder.taxReviewStatus || null,
            documents: (data.folder.documents || []).map((d: { status: string }) => ({ status: d.status })),
          },
        });
      } catch {
        // 取れなければ説明が出ないだけ。作業は止めない
      }
    })();
    return () => { alive = false; };
  }, [folderId, pathname]);

  /* 別のフォルダの状態が残っていても使わない（古い工程の説明を出さない） */
  const folderInfo = loaded && loaded.folderId === folderId ? loaded.info : null;

  const currentStep = folderId
    ? folderInfo
      ? computeCurrentStep(folderInfo, isTypeB, pathname)
      : null
    : "dashboard";

  const chapters = (
    currentStep === "dashboard"
      ? GUIDE_FOR_DASHBOARD
      : currentStep
        ? GUIDE_FOR_STEP[currentStep] ?? []
        : []
  )
    .map(chapterByStep)
    .filter((c): c is NonNullable<typeof c> => !!c);

  /*
    **初めてその工程に来たときだけ開く。** 2回目からは閉じたまま。
    初めての人は読める、慣れた人の邪魔にならない。

    工程が決まるのは読み込みのあと（フォルダの状態を待つ）なので、
    ここは副作用として書くしかない。開くのは1工程につき1回だけ。
  */
  /* 判定済みの工程。**ref にするのは、覚えるだけで描き直しが要らないため** */
  const autoOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!currentStep || chapters.length === 0) return;
    if (autoOpened.current === currentStep) return;
    autoOpened.current = currentStep;
    if (!readSeen(userId).includes(currentStep)) setOpenStep(currentStep);
  }, [currentStep, chapters.length, userId]);

  /** 工程が一致している間だけ開いている。画面が変われば自然に閉じる */
  const open = !!currentStep && openStep === currentStep;

  /*
    本文を押しのける。**印はここで付ける** ―― パネルは fixed なので、
    自分が出たことを本文に伝える手立てが他にない。
    幅の指定は globals.css の `body.guide-open` にある。
  */
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("guide-open");
    return () => document.body.classList.remove("guide-open");
  }, [open]);

  const close = () => {
    setOpenStep(null);
    if (currentStep) markSeen(userId, currentStep);
  };

  if (status !== "authenticated") return null;
  if (isHiddenPath(pathname)) return null;
  if (chapters.length === 0) return null;

  const stepLabel = currentStep && currentStep !== "dashboard" ? STEP_LABELS[currentStep] : null;

  return (
    <>
      {/*
        開閉ボタンは**左下**。右下はフォルダ画面のCSVエクスポートが
        使っている（fixed bottom-6 right-6 z-40）ので、ぶつけない。
      */}
      {!open && (
        <button
          onClick={() => setOpenStep(currentStep)}
          className="app-chrome fixed bottom-6 left-6 z-30 inline-flex items-center gap-2 px-4 py-3 bg-white border-2 border-teal-300 text-teal-800 rounded-full shadow-lg hover:bg-teal-50 transition-colors font-bold"
        >
          <BookOpen className="w-5 h-5" />
          やり方
        </button>
      )}

      {open && (
        <>
          {/* 画面が狭いときは全画面になるので、後ろを暗くして迷わせない */}
          <div
            onClick={close}
            className="app-chrome fixed inset-0 z-40 bg-black/30 lg:hidden"
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label="やり方"
            className={cn(
              "app-chrome fixed z-40 bg-white shadow-2xl flex flex-col",
              // 狭い画面: 下から全面
              "inset-x-0 bottom-0 top-16 rounded-t-2xl",
              /*
                広い画面: 右に貼り付く細いパネル。
                **`lg:left-auto` が要る** ―― `inset-x-0` が left:0 も入れるので、
                `lg:right-0` だけでは左端に出たままになる（実際そうなっていた）。
              */
              "lg:top-0 lg:left-auto lg:right-0 lg:h-full lg:w-[22rem] lg:border-l lg:border-teal-100 lg:rounded-none"
            )}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-teal-100 bg-teal-50/70 shrink-0">
              <div className="min-w-0">
                <p className="font-black text-foreground">やり方</p>
                {stepLabel && (
                  <p className="text-xs text-teal-800 truncate">いま：{stepLabel}</p>
                )}
              </div>
              <button
                onClick={close}
                aria-label="閉じる"
                className="p-2 -mr-2 text-gray-500 hover:text-gray-800 hover:bg-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {/*
                章の畳み込みと手順のチェックは GuideAccordion に任せる。
                `scope` はフォルダごとに分ける ―― 別のフォルダに移ったら
                チェックは白紙から始まるべきなので。
              */}
              <GuideAccordion chapters={chapters} scope={folderId ?? "dashboard"} />
            </div>

            <div className="border-t border-gray-200 px-4 py-3 shrink-0">
              <Link
                href={`/guide#step-${chapters[0].step}`}
                className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-900"
              >
                <ExternalLink className="w-4 h-4" />
                説明書を全部見る
              </Link>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
