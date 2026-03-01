"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, X, BookOpen } from "lucide-react";

interface PendingSubAccount {
  id: string;
  code: string;
  name: string;
  account: { code: string; name: string };
  client: { name: string } | null;
}

export default function PendingSubAccountsPage() {
  const [items, setItems] = useState<PendingSubAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPending = async () => {
    try {
      const res = await fetch("/api/accounts/sub/pending?detail=true");
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
    setProcessingId(id);
    try {
      const res = await fetch("/api/accounts/sub/approve", {
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
    if (!confirm("この補助科目を却下（削除）しますか？")) return;
    setProcessingId(id);
    try {
      const res = await fetch("/api/accounts/sub/approve", {
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
          補助科目の承認
        </h1>
        <p className="text-sm text-teal-700 mt-1">
          利用者が追加した補助科目を確認・承認します
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 md:py-16 card-glass rounded-xl">
          <BookOpen className="mx-auto h-12 w-12 md:h-16 md:w-16 text-teal-300 mb-4" />
          <h3 className="text-base md:text-lg font-medium text-foreground mb-2">
            未承認の補助科目はありません
          </h3>
          <p className="text-xs md:text-sm text-teal-700">
            利用者が新しい補助科目を追加するとここに表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="card-glass rounded-xl p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground">
                  {item.name}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-teal-700">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 rounded text-xs font-medium">
                    {item.account.code} {item.account.name}
                  </span>
                  {item.client && (
                    <span className="text-gray-500">
                      得意先: {item.client.name}
                    </span>
                  )}
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
                  承認
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
          ))}
        </div>
      )}
    </div>
  );
}
