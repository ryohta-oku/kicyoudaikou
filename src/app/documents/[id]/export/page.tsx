"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, FileSpreadsheet, CheckCircle } from "lucide-react";
import Stepper, { WORKFLOW_STEPS } from "@/components/Stepper";
import { cn } from "@/lib/utils";

interface Document {
  id: string;
  filename: string;
  status: string;
  journalEntries: { id: string; isConfirmed: boolean }[];
}

type CSVFormat = "generic" | "yayoi" | "freee";

const FORMAT_OPTIONS: { value: CSVFormat; label: string; description: string }[] = [
  {
    value: "generic",
    label: "汎用CSV",
    description: "どの会計ソフトにも取り込める一般的な形式",
  },
  {
    value: "yayoi",
    label: "弥生会計形式",
    description: "弥生会計の仕訳日記帳に取り込める形式",
  },
  {
    value: "freee",
    label: "freee形式",
    description: "freee会計に取り込める形式",
  },
];

export default function ExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<CSVFormat>("generic");
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    setExported(false);

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id, format: selectedFormat }),
      });

      if (!res.ok) {
        const data = await res.json();
        const code = data.code ? `[${data.code}] ` : "";
        const detail = data.detail ? `\n詳細: ${data.detail}` : "";
        throw new Error(`${code}${data.error || "エクスポートに失敗しました"}${detail}`);
      }

      // CSVをダウンロード
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `journal_entries_${selectedFormat}.csv`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      setExported(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エクスポートに失敗しました");
    } finally {
      setExporting(false);
    }
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

  const confirmedCount = document.journalEntries.filter((e) => e.isConfirmed).length;

  return (
    <div className="space-y-6">
      <Stepper steps={WORKFLOW_STEPS} currentStep="export" />

      <div className="flex items-center gap-4">
        <Link
          href={`/documents/${id}/final-review`}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          最終確認に戻る
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">CSVエクスポート</h1>
          <p className="text-sm text-gray-500">{document.filename}</p>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            エクスポート設定
          </h2>
          <p className="text-sm text-gray-500">
            {confirmedCount} 件の確認済み仕訳をCSVファイルとして出力します
          </p>
        </div>

        {/* フォーマット選択 */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            出力形式を選択
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FORMAT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedFormat(option.value)}
                className={cn(
                  "border rounded-xl p-4 text-left transition-colors",
                  selectedFormat === option.value
                    ? "border-teal-500 bg-teal-50 ring-2 ring-teal-200"
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <FileSpreadsheet className={cn(
                    "w-5 h-5",
                    selectedFormat === option.value ? "text-teal-600" : "text-gray-400"
                  )} />
                  <span className={cn(
                    "font-medium text-sm",
                    selectedFormat === option.value ? "text-teal-900" : "text-gray-900"
                  )}>
                    {option.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {exported && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-sm text-green-700">
              CSVファイルのダウンロードが完了しました
            </p>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            onClick={handleExport}
            disabled={exporting || confirmedCount === 0}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors",
              exporting || confirmedCount === 0
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-teal-600 text-white hover:bg-teal-700"
            )}
          >
            {exporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                エクスポート中...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                CSVをダウンロード
              </>
            )}
          </button>

          {confirmedCount === 0 && (
            <p className="text-sm text-orange-600">
              確認済みの仕訳がありません。仕訳分類画面で確認してください。
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-center">
        <Link
          href="/"
          className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
        >
          ダッシュボードに戻る
        </Link>
      </div>
    </div>
  );
}
