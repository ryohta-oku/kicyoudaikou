"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEffectiveRole } from "@/lib/roleSimulation";

interface Step {
  id: string;
  label: string;
}

// A型: 全工程
const STEPS_A_FULL: Step[] = [
  { id: "upload", label: "アップロード" },
  { id: "ocr", label: "OCR読み取り" },
  { id: "ocr_confirm", label: "OCR確認" },
  { id: "classify", label: "仕訳分類" },
  { id: "review", label: "仕訳確認" },
  { id: "done", label: "完了" },
];

// A型: 引き継ぎ受け（B型がOCR確認まで完了済み）
const STEPS_A_HANDOFF: Step[] = [
  { id: "classify", label: "仕訳分類" },
  { id: "review", label: "仕訳確認" },
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
  { id: "done", label: "完了" },
];

interface FolderInfo {
  handoffStatus: string | null;
  doubleCheckStatus: string | null;
  needsDoubleCheck: boolean;
  documents: { status: string }[];
}

/** ステップの順序マップ（大きいほど進んでいる） */
const STEP_ORDER: Record<string, number> = {
  upload: 0,
  ocr: 1,
  ocr_confirm: 2,
  double_check: 3,
  classify: 4,
  review: 5,
  done: 6,
  handoff: 4, // B型の引き継ぎはダブルチェックの次
};

/** フォルダ内ドキュメントの実際のステータスから現在のステップを算出 */
function computeCurrentStep(folder: FolderInfo, isTypeB: boolean, pathname: string): string {
  const docs = folder.documents;
  if (docs.length === 0) return "upload";

  const statuses = docs.map((d) => d.status);

  // B型: 引き継ぎ済みなら最終ステップ
  if (isTypeB && folder.handoffStatus === "handed_off") return "handoff";

  // B型: ダブルチェック中
  if (isTypeB && folder.doubleCheckStatus === "pending") return "double_check";
  if (isTypeB && folder.doubleCheckStatus === "completed") return "handoff";

  // A型: needsDoubleCheck
  if (!isTypeB && folder.handoffStatus === "handed_off" && folder.needsDoubleCheck) return "double_check";

  // ドキュメントステータスからステップを算出
  let statusStep: string;
  if (statuses.some((s) => s === "uploaded" || s === "ocr_processing")) {
    statusStep = "ocr";
  } else if (statuses.some((s) => s === "ocr_complete")) {
    statusStep = "ocr_confirm";
  } else if (statuses.every((s) => s === "ocr_confirmed")) {
    statusStep = isTypeB ? "double_check" : "classify";
  } else if (statuses.every((s) => s === "reviewed" || s === "exported")) {
    statusStep = "done";
  } else if (statuses.some((s) => s === "classified" || s === "reviewed")) {
    statusStep = "review";
  } else {
    statusStep = "classify";
  }

  // 現在のページに対応するステップ
  let pageStep: string | null = null;
  if (pathname.endsWith("/classify")) {
    pageStep = "classify";
  }

  // ページのステップとドキュメントステータスの低い方を採用
  // （classifyページにいるのに「完了」になるのを防ぐ）
  if (pageStep && (STEP_ORDER[statusStep] ?? 0) > (STEP_ORDER[pageStep] ?? 0)) {
    return pageStep;
  }

  return statusStep;
}

/** パス名からフォルダIDを取得 */
function extractFolderId(pathname: string): string | null {
  const match = pathname.match(/^\/folders\/([^/]+)/);
  return match ? match[1] : null;
}

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
    <div className="bg-white border-b">
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
