"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEffectiveRole } from "@/lib/roleSimulation";

interface Step {
  id: string;
  label: string;
}

const STEPS_A: Step[] = [
  { id: "upload", label: "アップロード" },
  { id: "ocr", label: "OCR読み取り" },
  { id: "ocr_confirm", label: "OCR確認" },
  { id: "classify", label: "仕訳分類" },
  { id: "review", label: "仕訳確認" },
  { id: "done", label: "完了" },
];

const STEPS_B: Step[] = [
  { id: "upload", label: "アップロード" },
  { id: "ocr", label: "OCR読み取り" },
  { id: "ocr_confirm", label: "OCR確認" },
  { id: "done", label: "完了" },
];

function getCurrentStep(pathname: string): string | null {
  if (pathname === "/") return "upload";

  // フォルダ詳細 (/folders/[id])
  if (pathname.match(/^\/folders\/[^/]+$/)) return "ocr";

  // ドキュメント系 (/documents/[id]/xxx) とフォルダ系 (/folders/[id]/xxx)
  if (pathname.match(/^\/(documents|folders)\/[^/]+\/ocr-review$/)) return "ocr_confirm";
  if (pathname.match(/^\/(documents|folders)\/[^/]+\/classify$/)) return "classify";
  if (pathname.match(/^\/(documents|folders)\/[^/]+\/final-review$/)) return "review";
  if (pathname.match(/^\/(documents|folders)\/[^/]+\/export$/)) return "done";

  // 管理ページ等 → 非表示
  return null;
}

export default function WorkflowProgressBar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const currentStepId = getCurrentStep(pathname);
  if (!currentStepId) return null;

  const role = session?.user?.role
    ? getEffectiveRole(session.user.role as string)
    : null;

  const isTypeB = role === "user_b";
  const steps = isTypeB ? STEPS_B : STEPS_A;

  const currentIndex = steps.findIndex((s) => s.id === currentStepId);
  // B型でA型専用ステップにいる場合は非表示
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
