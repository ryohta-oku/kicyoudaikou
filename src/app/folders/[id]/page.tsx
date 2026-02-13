"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import {
  FileText,
  ArrowLeft,
  Eye,
  ArrowRight,
  Trash2,
  Loader2,
  Download,
  FolderOpen,
} from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";

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

interface Folder {
  id: string;
  name: string;
  creator: string;
  createdAt: string;
  documents: Document[];
}

export default function FolderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchFolder = useCallback(async () => {
    try {
      const res = await fetch(`/api/folders/${id}`);
      const data = await res.json();
      setFolder(data.folder || null);
    } catch (error) {
      console.error("Failed to fetch folder:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchFolder();
  }, [fetchFolder]);

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm("このドキュメントを削除してもよろしいですか？")) return;
    setDeletingId(docId);
    try {
      await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      setFolder((prev) =>
        prev
          ? { ...prev, documents: prev.documents.filter((d) => d.id !== docId) }
          : null
      );
    } finally {
      setDeletingId(null);
    }
  };

  const getNextAction = (status: string, docId: string) => {
    switch (status) {
      case "uploaded":
        return { href: `/documents/${docId}/ocr-review`, label: "OCR処理開始" };
      case "ocr_processing":
        return { href: `/documents/${docId}/ocr-review`, label: "処理中..." };
      case "ocr_complete":
        return { href: `/documents/${docId}/ocr-review`, label: "OCR確認" };
      case "classified":
        return { href: `/documents/${docId}/classify`, label: "仕訳確認" };
      case "reviewed":
        return { href: `/documents/${docId}/export`, label: "エクスポート" };
      case "exported":
        return { href: `/documents/${docId}/export`, label: "再エクスポート" };
      default:
        return { href: `/documents/${docId}/ocr-review`, label: "確認" };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">フォルダが見つかりません</p>
        <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
          ダッシュボードに戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          ダッシュボード
        </Link>
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-yellow-500" />
          <h1 className="text-xl font-bold text-gray-900">{folder.name}</h1>
        </div>
        <span className="text-sm text-gray-500">
          {folder.documents.length} ファイル
        </span>
      </div>

      {/* ドキュメント一覧 */}
      {folder.documents.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <FileText className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            ドキュメントがありません
          </h3>
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
                    ファイル名
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    ステータス
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
                {folder.documents.map((doc) => {
                  const nextAction = getNextAction(doc.status, doc.id);
                  const canExport =
                    doc.status === "reviewed" || doc.status === "exported";
                  return (
                    <tr key={doc.id} className="border-b hover:bg-gray-50">
                      {/* 作成日 */}
                      <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                        {new Date(doc.createdAt).toLocaleDateString("ja-JP")}
                      </td>
                      {/* ファイル名 */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                          <span className="text-gray-900 truncate max-w-[250px]">
                            {doc.filename}
                          </span>
                        </div>
                      </td>
                      {/* ステータス */}
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
                            onClick={() => handleDeleteDocument(doc.id)}
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
