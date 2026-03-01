"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  id: string;
  label: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: string;
}

export default function Stepper({ steps, currentStep }: StepperProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <nav className="mb-8">
      <ol className="flex items-center w-full">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center",
                index < steps.length - 1 ? "w-full" : ""
              )}
            >
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 text-sm font-bold transition-colors",
                    isCompleted
                      ? "bg-teal-600 border-teal-600 text-white"
                      : isCurrent
                        ? "border-teal-600 text-teal-600 bg-teal-50"
                        : "border-gray-300 text-gray-400 bg-white"
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium text-center whitespace-nowrap",
                    isCurrent ? "text-teal-600" : isCompleted ? "text-gray-700" : "text-gray-400"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-4 mt-[-1.5rem]",
                    isCompleted ? "bg-teal-600" : "bg-gray-200"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const WORKFLOW_STEPS: Step[] = [
  { id: "upload", label: "アップロード", description: "PDFファイルをアップロード" },
  { id: "ocr", label: "OCR確認", description: "読み取り結果の確認・修正" },
  { id: "classify", label: "仕訳分類", description: "AI自動分類の確認" },
  { id: "review", label: "最終確認", description: "仕訳データの最終チェック" },
  { id: "export", label: "エクスポート", description: "CSV出力" },
];
