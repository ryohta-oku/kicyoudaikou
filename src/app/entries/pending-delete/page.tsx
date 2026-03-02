"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, X, Trash2 } from "lucide-react";
import Image from "next/image";
import { formatCurrency } from "@/lib/utils";

interface DeletionRequestItem {
  id: string;
  reason: string;
  requestedBy: string;
  createdAt: string;
  entry: {
    id: string;
    date: string;
    description: string;
    accountCode: string;
    accountName: string;
    debitAmount: number;
    creditAmount: number;
    taxRate: string;
  };
  document: {
    id: string;
    filename: string;
    filepath: string;
    fileType: string;
    pages: { id: string; imagePath: string; pageNumber: number }[];
  };
}

export default function PendingDeletePage() {
  const [items, setItems] = useState<DeletionRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPending = async () => {
    try {
      const res = await fetch("/api/entries/delete-request/pending?detail=true");
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (id: string) => {
    if (!confirm("この削除依頼を承認しますか？\n仕訳データ（および他に仕訳がなければ元ファイル）が削除されます。")) return;
    setProcessingId(id);
    try {
      const res = await fetch("/api/entries/delete-request/approve", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!confirm("この削除依頼を却下しますか？")) return;
    setProcessingId(id);
    try {
      const res = await fetch("/api/entries/delete-request/approve", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-black text-foreground">
          削除依頼の承認
        </h1>
        <p className="text-sm text-teal-700 mt-1">
          利用者が依頼した仕訳の削除を確認・承認します
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 md:py-16 card-glass rounded-xl">
          <Trash2 className="mx-auto h-12 w-12 md:h-16 md:w-16 text-teal-300 mb-4" />
          <h3 className="text-base md:text-lg font-medium text-foreground mb-2">
            未承認の削除依頼はありません
          </h3>
          <p className="text-xs md:text-sm text-teal-700">
            利用者が仕訳の削除を依頼するとここに表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="card-glass rounded-xl overflow-hidden"
            >
              <div className="flex flex-col lg:flex-row">
                {/* 左: 元ファイルサムネイル */}
                <div className="lg:w-48 flex-shrink-0 bg-gray-50 border-b lg:border-b-0 lg:border-r">
                  <div className="px-3 py-1.5 bg-teal-50/80 border-b">
                    <p className="text-[11px] text-teal-700 truncate">{item.document.filename}</p>
                  </div>
                  {item.document.fileType === "pdf" ? (
                    <iframe
                      src={`/api/files?path=${encodeURIComponent(item.document.filepath)}`}
                      className="w-full border-0"
                      style={{ height: "160px" }}
                      title={`PDF - ${item.document.filename}`}
                    />
                  ) : item.document.pages[0] ? (
                    <div className="overflow-hidden" style={{ maxHeight: "160px" }}>
                      <Image
                        src={`/api/files?path=${encodeURIComponent(item.document.pages[0].imagePath)}`}
                        alt={item.document.filename}
                        width={192}
                        height={160}
                        className="w-full h-auto"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400 text-xs">画像なし</div>
                  )}
                </div>

                {/* 右: 仕訳情報 + アクション */}
                <div className="flex-1 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <p className="text-base font-semibold text-foreground">
                      {item.entry.description || "（摘要なし）"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-teal-700">
                      {item.entry.date && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 rounded text-xs font-medium">
                          {item.entry.date}
                        </span>
                      )}
                      {item.entry.accountName && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 rounded text-xs font-medium">
                          {item.entry.accountCode} {item.entry.accountName}
                        </span>
                      )}
                      <span className="font-mono text-sm font-medium text-foreground">
                        {item.entry.debitAmount > 0
                          ? formatCurrency(item.entry.debitAmount)
                          : item.entry.creditAmount > 0
                          ? formatCurrency(item.entry.creditAmount)
                          : "-"}
                      </span>
                      {item.entry.taxRate && (
                        <span className="text-xs text-gray-500">{item.entry.taxRate}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      依頼者: {item.requestedBy || "不明"} ・{" "}
                      {new Date(item.createdAt).toLocaleString("ja-JP", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {item.reason !== "duplicate" && ` ・ 理由: ${item.reason}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApprove(item.id)}
                      disabled={processingId === item.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {processingId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      承認（削除）
                    </button>
                    <button
                      onClick={() => handleReject(item.id)}
                      disabled={processingId === item.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      <X className="w-4 h-4" />
                      却下
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
