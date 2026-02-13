"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import Stepper, { WORKFLOW_STEPS } from "@/components/Stepper";
import JournalEntryTable from "@/components/JournalEntryTable";

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  accountCode: string;
  accountName: string;
  subAccountCode: string;
  subAccountName: string;
  debitAmount: number;
  creditAmount: number;
  taxRate: string;
  aiSuggested: boolean;
  isConfirmed: boolean;
}

interface Account {
  code: string;
  name: string;
  category: string;
}

interface Document {
  id: string;
  filename: string;
  status: string;
  journalEntries: JournalEntry[];
}

export default function ClassifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [document, setDocument] = useState<Document | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocument = async () => {
    try {
      const res = await fetch(`/api/documents/${id}`);
      const data = await res.json();
      if (data.document) {
        setDocument(data.document);
      } else if (data.code) {
        setError(`[${data.code}] ${data.error}${data.detail ? `\n詳細: ${data.detail}` : ""}`);
      }
    } catch {
      setError("ドキュメントの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch {
      // accounts fetch is optional
    }
  };

  useEffect(() => {
    fetchDocument();
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const startClassification = async () => {
    setClassifying(true);
    setError(null);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });

      if (!res.ok) {
        const data = await res.json();
        const code = data.code ? `[${data.code}] ` : "";
        const detail = data.detail ? `\n詳細: ${data.detail}` : "";
        throw new Error(`${code}${data.error || "仕訳分類に失敗しました"}${detail}`);
      }

      await fetchDocument();
    } catch (err) {
      setError(err instanceof Error ? err.message : "仕訳分類に失敗しました");
    } finally {
      setClassifying(false);
    }
  };

  const handleEntryUpdate = async (entryId: string, data: Partial<JournalEntry>) => {
    const res = await fetch("/api/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entryId, ...data }),
    });

    if (!res.ok) throw new Error("更新に失敗しました");
    await fetchDocument();
  };

  const handleEntryDelete = async (entryId: string) => {
    const res = await fetch("/api/entries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entryId }),
    });

    if (!res.ok) throw new Error("削除に失敗しました");
    await fetchDocument();
  };

  const handleEntryAdd = async (data: Partial<JournalEntry>) => {
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) throw new Error("追加に失敗しました");
    await fetchDocument();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">ドキュメントが見つかりません</p>
      </div>
    );
  }

  const hasEntries = document.journalEntries.length > 0;
  const allConfirmed = hasEntries && document.journalEntries.every((e) => e.isConfirmed);

  return (
    <div className="space-y-6">
      <Stepper steps={WORKFLOW_STEPS} currentStep="classify" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/documents/${id}/ocr-review`}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            OCR確認に戻る
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">AI仕訳分類</h1>
            <p className="text-sm text-gray-500">{document.filename}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={startClassification}
            disabled={classifying}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium disabled:bg-gray-400"
          >
            {classifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                分類中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {hasEntries ? "再分類" : "AI自動分類を実行"}
              </>
            )}
          </button>
          {allConfirmed && (
            <button
              onClick={() => router.push(`/documents/${id}/final-review`)}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              次へ: 最終確認
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {hasEntries ? (
        <>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <span className="font-medium">AIが推測した勘定科目</span>には「AI」タグが表示されています。
              内容を確認し、必要に応じて修正してから「確認」ボタンを押してください。
            </p>
          </div>
          <JournalEntryTable
            entries={document.journalEntries}
            accounts={accounts}
            editable={true}
            onUpdate={handleEntryUpdate}
            onDelete={handleEntryDelete}
            onAdd={handleEntryAdd}
            documentId={id}
          />
        </>
      ) : (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Sparkles className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            AI自動分類を実行してください
          </h3>
          <p className="text-sm text-gray-500">
            OCRで読み取ったテキストから、AIが自動的に勘定科目を推測します
          </p>
        </div>
      )}
    </div>
  );
}
