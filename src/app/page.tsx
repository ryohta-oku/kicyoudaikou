"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  Upload,
  Eye,
  ArrowRight,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import FileUpload from "@/components/FileUpload";

interface Document {
  id: string;
  filename: string;
  filepath: string;
  status: string;
  createdAt: string;
  pages: { id: string }[];
  _count: { journalEntries: number };
}

export default function DashboardPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleUploadComplete = (documentId: string) => {
    router.push(`/documents/${documentId}/ocr-review`);
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
          新しいPDFをアップロード
        </button>
      </div>

      {/* アップロードエリア */}
      {showUpload && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            PDFファイルをアップロード
          </h2>
          <FileUpload onUploadComplete={handleUploadComplete} />
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
            PDFファイルをアップロードして記帳作業を始めましょう
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
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-6 py-3 text-left font-medium text-gray-600">
                  ファイル名
                </th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">
                  ステータス
                </th>
                <th className="px-6 py-3 text-center font-medium text-gray-600">
                  ページ数
                </th>
                <th className="px-6 py-3 text-center font-medium text-gray-600">
                  仕訳数
                </th>
                <th className="px-6 py-3 text-left font-medium text-gray-600">
                  作成日
                </th>
                <th className="px-6 py-3 text-center font-medium text-gray-600">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const nextAction = getNextAction(doc.status, doc.id);
                return (
                  <tr key={doc.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <span className="font-medium text-gray-900 truncate max-w-[200px]">
                          {doc.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex px-2.5 py-1 rounded-full text-xs font-medium",
                          STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-800"
                        )}
                      >
                        {STATUS_LABELS[doc.status] || doc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600">
                      {doc.pages.length}
                    </td>
                    <td className="px-6 py-4 text-center text-gray-600">
                      {doc._count.journalEntries}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {new Date(doc.createdAt).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="px-6 py-4">
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
      )}
    </div>
  );
}
