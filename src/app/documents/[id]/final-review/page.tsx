"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, CheckCircle } from "lucide-react";
import Stepper, { WORKFLOW_STEPS } from "@/components/Stepper";
import JournalEntryTable from "@/components/JournalEntryTable";
import { formatCurrency } from "@/lib/utils";

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

interface Document {
  id: string;
  filename: string;
  status: string;
  journalEntries: JournalEntry[];
}

export default function FinalReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        const res = await fetch(`/api/documents/${id}`);
        const data = await res.json();
        if (data.document) {
          setDocument(data.document);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchDocument();
  }, [id]);

  const handleMarkReviewed = async () => {
    await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "reviewed" }),
    });
    router.push(`/documents/${id}/export`);
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

  const confirmedEntries = document.journalEntries.filter((e) => e.isConfirmed);
  const totalDebit = confirmedEntries.reduce((sum, e) => sum + e.debitAmount, 0);
  const totalCredit = confirmedEntries.reduce((sum, e) => sum + e.creditAmount, 0);

  return (
    <div className="space-y-6">
      <Stepper steps={WORKFLOW_STEPS} currentStep="review" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/documents/${id}/classify`}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            仕訳分類に戻る
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">最終確認</h1>
            <p className="text-sm text-gray-500">{document.filename}</p>
          </div>
        </div>

        <button
          onClick={handleMarkReviewed}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          <CheckCircle className="w-4 h-4" />
          確認完了 → エクスポートへ
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm text-gray-500">総仕訳数</p>
          <p className="text-2xl font-bold text-gray-900">{document.journalEntries.length}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm text-gray-500">確認済</p>
          <p className="text-2xl font-bold text-green-600">{confirmedEntries.length}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm text-gray-500">借方合計</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalDebit)}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm text-gray-500">貸方合計</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalCredit)}</p>
        </div>
      </div>

      {totalDebit !== totalCredit && totalDebit > 0 && totalCredit > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800 font-medium">
            借方合計と貸方合計が一致していません。仕訳内容を確認してください。
          </p>
        </div>
      )}

      <JournalEntryTable
        entries={document.journalEntries}
        editable={false}
      />
    </div>
  );
}
