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

// B型: アップロード〜OCR確認〜引き継ぎ
const STEPS_B: Step[] = [
  { id: "upload", label: "アップロード" },
  { id: "ocr", label: "OCR読み取り" },
  { id: "ocr_confirm", label: "OCR確認" },
  { id: "handoff", label: "引き継ぎ" },
];

interface FolderInfo {
  handoffStatus: string | null;
  documents: { status: string }[];
}

/** フォルダ内ドキュメントの実際のステータスから現在のステップを算出 */
function computeCurrentStep(folder: FolderInfo, isTypeB: boolean): string {
  const docs = folder.documents;
  if (docs.length === 0) return "upload";

  const statuses = docs.map((d) => d.status);

  // B型: 引き継ぎ済みなら最終ステップ
  if (isTypeB && folder.handoffStatus === "handed_off") return "handoff";

  // 全ドキュメントのステータスで判定
  if (statuses.some((s) => s === "uploaded" || s === "ocr_processing")) return "ocr";
  if (statuses.some((s) => s === "ocr_complete")) return "ocr_confirm";
  if (statuses.every((s) => s === "ocr_confirmed")) {
    // B型ならOCR確認完了 → 引き継ぎ待ち
    if (isTypeB) return "handoff";
    return "classify";
  }
  // 全ドキュメントが reviewed 以上なら完了
  if (statuses.every((s) => s === "reviewed" || s === "exported")) return "done";
  if (statuses.some((s) => s === "classified" || s === "reviewed")) return "review";

  // classified以降が混在
  return "classify";
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
    } else {
      setFolderInfo(null);
    }
  }, [folderId, fetchFolderInfo]);

  // ダッシュボードや管理ページでは非表示
  if (!folderId) return null;

  // フォルダ情報がまだ読み込まれていない場合は非表示（ちらつき防止）
  if (!folderInfo) return null;

  // ステップセットの決定
  let steps: Step[];
  if (isTypeB) {
    steps = STEPS_B;
  } else if (folderInfo.handoffStatus === "handed_off") {
    // A型で引き継ぎ受けフォルダ
    steps = STEPS_A_HANDOFF;
  } else {
    // A型で自分が最初からやるフォルダ
    steps = STEPS_A_FULL;
  }

  const currentStepId = computeCurrentStep(folderInfo, isTypeB);
  const currentIndex = steps.findIndex((s) => s.id === currentStepId);

  // 現在のステップがこのステップセットにない場合は非表示
  if (currentIndex === -1) return null;

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
                        ? "bg-blue-600 text-white"
                        : isCurrent
                          ? "border-2 border-blue-600 text-blue-600 animate-pulse"
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
                        ? "text-blue-600"
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
                      isCompleted ? "bg-blue-600" : "bg-gray-200"
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
