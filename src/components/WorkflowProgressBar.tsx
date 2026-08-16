"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEffectiveRole } from "@/lib/roleSimulation";
/*
  工程の判定は lib に移した。**説明のパネルも同じ判定を使う** ――
  2か所に別々に書くと、バーは「仕訳分類」なのに説明は「最終確認」を出す、
  という形の食い違いになる。
*/
import {
  computeCurrentStep,
  extractFolderId,
  type FolderInfo,
} from "@/lib/workflow-step";

interface Step {
  id: string;
  label: string;
}

/**
 * 利用者の全工程。
 *
 * 2026-09-01 に A型のみになり、**ダブルチェックがこの流れの中に入った**
 * （それまでは B型がOCR確認まで進めてA型に引き継いでいた）。
 */
const STEPS_A_FULL: Step[] = [
  { id: "upload", label: "アップロード" },
  { id: "ocr", label: "OCR読み取り" },
  { id: "ocr_confirm", label: "OCR確認" },
  { id: "double_check", label: "ダブルチェック" },
  { id: "classify", label: "仕訳分類" },
  { id: "review", label: "仕訳確認" },
  { id: "final_review", label: "最終確認" },
  /** 税理士に見てもらう工程。事業所の手は離れている */
  { id: "tax_review", label: "税理士確認" },
  { id: "done", label: "完了" },
];

// A型: 引き継ぎ受け（B型がOCR確認まで完了済み）
const STEPS_A_HANDOFF: Step[] = [
  { id: "classify", label: "仕訳分類" },
  { id: "review", label: "仕訳確認" },
  { id: "final_review", label: "最終確認" },
  { id: "done", label: "完了" },
];

// B型: アップロード〜OCR確認〜ダブルチェック〜引き継ぎ
const STEPS_B: Step[] = [
  { id: "upload", label: "アップロード" },
  { id: "ocr", label: "OCR読み取り" },
  { id: "ocr_confirm", label: "1stチェック" },
  { id: "double_check", label: "ダブルチェック" },
  { id: "handoff", label: "引き継ぎ" },
];

// A型: 引き継ぎ受け（needsDoubleCheck 時）
const STEPS_A_HANDOFF_DC: Step[] = [
  { id: "double_check", label: "ダブルチェック" },
  { id: "classify", label: "仕訳分類" },
  { id: "review", label: "仕訳確認" },
  { id: "final_review", label: "最終確認" },
  { id: "done", label: "完了" },
];

export default function WorkflowProgressBar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null);

  const role = session?.user?.role
    ? getEffectiveRole(session.user.role as string)
    : null;
  const isTypeB = role === "user_b";

  const folderId = extractFolderId(pathname);

  const fetchFolderInfo = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/folders/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.folder) {
        setFolderInfo({
          handoffStatus: data.folder.handoffStatus || null,
          doubleCheckStatus: data.folder.doubleCheckStatus || null,
          needsDoubleCheck: data.folder.needsDoubleCheck || false,
          documents: (data.folder.documents || []).map((d: { status: string }) => ({
            status: d.status,
          })),
        });
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (folderId) {
      fetchFolderInfo(folderId);
      // ドキュメントステータスが変わる可能性があるため定期的に再取得
      const interval = setInterval(() => fetchFolderInfo(folderId), 3000);
      return () => clearInterval(interval);
    } else {
      setFolderInfo(null);
    }
    // pathname変更時（同一フォルダ内のページ遷移）も再取得
  }, [folderId, pathname, fetchFolderInfo]);

  // ダッシュボードや管理ページでは非表示
  if (!folderId) return null;

  // フォルダ情報がまだ読み込まれていない場合は非表示（ちらつき防止）
  if (!folderInfo) return null;

  // ステップセットの決定
  let steps: Step[];
  if (isTypeB) {
    steps = STEPS_B;
  } else if (folderInfo.handoffStatus === "handed_off" && folderInfo.needsDoubleCheck) {
    // A型で引き継ぎ受け + ダブルチェック必要
    steps = STEPS_A_HANDOFF_DC;
  } else if (folderInfo.handoffStatus === "handed_off") {
    // A型で引き継ぎ受けフォルダ
    steps = STEPS_A_HANDOFF;
  } else {
    // A型で自分が最初からやるフォルダ
    steps = STEPS_A_FULL;
  }

  const currentStepId = computeCurrentStep(folderInfo, isTypeB, pathname);
  const rawIndex = steps.findIndex((s) => s.id === currentStepId);

  // 現在のステップがこのステップセットにない場合は非表示
  if (rawIndex === -1) return null;

  // 最終ステップに到達したら全ステップを完了表示
  const currentIndex = rawIndex === steps.length - 1 ? steps.length : rawIndex;

  return (
    <div className="app-chrome bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-2 overflow-x-auto">
          {steps.map((step, index) => {
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <div key={step.id} className="flex items-center flex-1 min-w-0 last:flex-none">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div
                    className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors flex-shrink-0",
                      isCompleted
                        ? "bg-teal-600 text-white"
                        : isCurrent
                          ? "border-2 border-teal-600 text-teal-600 animate-pulse"
                          : "border border-gray-300 text-gray-400"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium whitespace-nowrap hidden sm:inline",
                      isCurrent
                        ? "text-teal-600"
                        : isCompleted
                          ? "text-gray-700"
                          : "text-gray-400"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-2 min-w-[12px]",
                      isCompleted ? "bg-teal-600" : "bg-gray-200"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
