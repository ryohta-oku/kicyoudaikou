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
  ocr_confirmed: "OCR確認完了",
  classified: "仕訳済",
  reviewed: "確認済",
  exported: "エクスポート済",
  handed_off: "引き継ぎ済",
  double_check_pending: "ダブルチェック待ち",
  double_check_completed: "ダブルチェック完了",
  tax_pending: "税理士が確認中",
  tax_returned: "税理士から差し戻し",
};

export const STATUS_COLORS: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-800",
  ocr_processing: "bg-yellow-100 text-yellow-800",
  ocr_complete: "bg-teal-100 text-teal-800",
  ocr_confirmed: "bg-indigo-100 text-indigo-800",
  classified: "bg-purple-100 text-purple-800",
  reviewed: "bg-green-100 text-green-800",
  exported: "bg-emerald-100 text-emerald-800",
  handed_off: "bg-cyan-100 text-cyan-800",
  double_check_pending: "bg-orange-100 text-orange-800",
  double_check_completed: "bg-green-100 text-green-800",
  tax_pending: "bg-indigo-100 text-indigo-700",
  // 差し戻しは手を動かす必要がある。他の状態より強く見せる
  tax_returned: "bg-red-100 text-red-700",
};
