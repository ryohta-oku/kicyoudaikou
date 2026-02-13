import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("ja-JP");
}

export const STATUS_LABELS: Record<string, string> = {
  uploaded: "アップロード済",
  ocr_processing: "OCR処理中",
  ocr_complete: "OCR完了",
  classified: "仕訳済",
  reviewed: "確認済",
  exported: "エクスポート済",
};

export const STATUS_COLORS: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-800",
  ocr_processing: "bg-yellow-100 text-yellow-800",
  ocr_complete: "bg-blue-100 text-blue-800",
  classified: "bg-purple-100 text-purple-800",
  reviewed: "bg-green-100 text-green-800",
  exported: "bg-emerald-100 text-emerald-800",
};
