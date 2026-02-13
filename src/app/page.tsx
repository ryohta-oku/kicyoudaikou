"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  FileText,
  Upload,
  Eye,
  ArrowRight,
  Trash2,
  Loader2,
  Download,
} from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import FileUpload from "@/components/FileUpload";

interface Document {
  id: string;
  filename: string;
  filepath: string;
  title: string;
  creator: string;
  status: string;
  createdAt: string;
  pages: { id: string }[];
  _count: { journalEntries: number };
}

export default function DashboardPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleBulkUploadComplete = () => {
    // アップロード＋OCR完了後にドキュメント一覧をリフレッシュ
    fetchDocuments();
    setShowUpload(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このドキュメントを削除してもよろしいですか？")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const getNextAction = (status: string, id: string) => {
    switch (status) {
      case "uploaded":
        return { href: `/documents/${id}/ocr-review`, label: "OCR処理開始" };
      case "ocr_processing":
        return { href: `/documents/${id}/ocr-review`, label: "処理中..." };
      case "ocr_complete":
        return { href: `/documents/${id}/ocr-review`, label: "OCR確認" };
      case "classified":
        return { href: `/documents/${id}/classify`, label: "仕訳確認" };
      case "reviewed":
        return { href: `/documents/${id}/export`, label: "エクスポート" };
      case "exported":
        return { href: `/documents/${id}/export`, label: "再エクスポート" };
      default:
        return { href: `/documents/${id}/ocr-review`, label: "確認" };
    }
  };

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">
            アップロードされたドキュメントの管理
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Upload className="w-4 h-4" />
          ファイルをアップロード
        </button>
      </div>

      {/* アップロードエリア */}
      {showUpload && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            ファイルをアップロード（複数選択可）
          </h2>
          <FileUpload onBulkUploadComplete={handleBulkUploadComplete} />
        </div>
      )}

      {/* ドキュメント一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <FileText className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            ドキュメントがありません
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            PDF・画像ファイルをアップロードして記帳作業を始めましょう
          </p>
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            アップロード
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    作成日
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    タイトル
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    ファイル名
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    申請ステータス
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    作成者
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">
                    エクスポート
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const nextAction = getNextAction(doc.status, doc.id);
                  const canExport =
                    doc.status === "reviewed" || doc.status === "exported";
                  return (
                    <tr key={doc.id} className="border-b hover:bg-gray-50">
                      {/* 作成日 */}
                      <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                        {new Date(doc.createdAt).toLocaleDateString("ja-JP")}
                      </td>
                      {/* タイトル */}
                      <td className="px-4 py-4">
                        <span className="font-medium text-gray-900 truncate block max-w-[200px]">
                          {doc.title || doc.filename.replace(/\.[^.]+$/, "")}
                        </span>
                      </td>
                      {/* ファイル名 */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <span className="text-gray-600 truncate max-w-[180px]">
                            {doc.filename}
                          </span>
                        </div>
                      </td>
                      {/* 申請ステータス */}
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "inline-flex px-2.5 py-1 rounded-full text-xs font-medium",
                            STATUS_COLORS[doc.status] ||
                              "bg-gray-100 text-gray-800"
                          )}
                        >
                          {STATUS_LABELS[doc.status] || doc.status}
                        </span>
                      </td>
                      {/* 作成者 */}
                      <td className="px-4 py-4 text-gray-600">
                        {doc.creator || "-"}
                      </td>
                      {/* エクスポート */}
                      <td className="px-4 py-4 text-center">
                        {canExport ? (
                          <Link
                            href={`/documents/${doc.id}/export`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            CSV出力
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      {/* 操作 */}
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={nextAction.href}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            {doc.status === "uploaded" ? (
                              <Eye className="w-4 h-4" />
                            ) : (
                              <ArrowRight className="w-4 h-4" />
                            )}
                            {nextAction.label}
                          </Link>
                          <button
                            onClick={() => handleDelete(doc.id)}
                            disabled={deletingId === doc.id}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {deletingId === doc.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
