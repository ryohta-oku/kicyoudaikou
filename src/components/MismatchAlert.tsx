"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Mismatch {
  pageId: string;
  pageNumber: number;
  documentFilename: string;
  field: string;
  fieldLabel: string;
  firstValue: string;
  secondValue: string;
}

interface MismatchAlertProps {
  folderId: string;
  onResolve?: () => void;
}

export default function MismatchAlert({ folderId, onResolve }: MismatchAlertProps) {
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/folders/${folderId}/mismatches`)
      .then((res) => res.json())
      .then((data) => {
        setMismatches(data.mismatches || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [folderId]);

  const handleResolve = async (mismatch: Mismatch, value: string) => {
    const key = `${mismatch.pageId}:${mismatch.field}`;
    setResolving(key);
    try {
      const res = await fetch("/api/ocr/pages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: mismatch.pageId,
          [mismatch.field]: value,
        }),
      });
      if (!res.ok) throw new Error("更新に失敗しました");
      setMismatches((prev) => prev.filter((m) => !(m.pageId === mismatch.pageId && m.field === mismatch.field)));
      if (onResolve) onResolve();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setResolving(null);
    }
  };

  if (loading) return null;
  if (mismatches.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <span className="text-sm font-bold text-amber-800">
          ダブルチェックで不一致が見つかりました（{mismatches.length}件）
        </span>
      </div>
      <div className="divide-y divide-amber-100">
        {mismatches.map((m) => {
          const key = `${m.pageId}:${m.field}`;
          const isResolving = resolving === key;
          return (
            <div key={key} className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <span className="font-medium">{m.documentFilename}</span>
                <span>ページ {m.pageNumber}</span>
                <span className="font-bold">{m.fieldLabel}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => handleResolve(m, m.firstValue)}
                  disabled={isResolving}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left",
                    "border-teal-200 bg-white hover:bg-teal-50 disabled:opacity-50"
                  )}
                >
                  <div className="flex-1">
                    <div className="text-[10px] text-teal-600 font-medium mb-0.5">1stチェック値</div>
                    <div className="font-medium text-gray-900">{m.firstValue || "(空欄)"}</div>
                  </div>
                  {isResolving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-teal-500" />
                  ) : (
                    <Check className="w-4 h-4 text-teal-500" />
                  )}
                </button>
                <button
                  onClick={() => handleResolve(m, m.secondValue)}
                  disabled={isResolving}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left",
                    "border-amber-200 bg-white hover:bg-amber-50 disabled:opacity-50"
                  )}
                >
                  <div className="flex-1">
                    <div className="text-[10px] text-amber-600 font-medium mb-0.5">2ndチェック値</div>
                    <div className="font-medium text-gray-900">{m.secondValue || "(空欄)"}</div>
                  </div>
                  {isResolving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  ) : (
                    <Check className="w-4 h-4 text-amber-500" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
