"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  FolderOpen,
  Upload,
  Trash2,
  Loader2,
  FileText,
} from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import FileUpload from "@/components/FileUpload";

interface FolderDocument {
  id: string;
  filename: string;
  status: string;
}

interface Folder {
  id: string;
  name: string;
  creator: string;
  createdAt: string;
  documents: FolderDocument[];
}

function getFolderStatus(documents: FolderDocument[]): string {
  if (documents.length === 0) return "uploaded";
  const statuses = documents.map((d) => d.status);
  // 優先度順: 処理中 > アップロード済 > OCR完了 > 仕訳済 > 確認済 > エクスポート済
  if (statuses.some((s) => s === "ocr_processing")) return "ocr_processing";
  if (statuses.some((s) => s === "uploaded")) return "uploaded";
  if (statuses.some((s) => s === "ocr_complete")) return "ocr_complete";
  if (statuses.some((s) => s === "classified")) return "classified";
  if (statuses.some((s) => s === "reviewed")) return "reviewed";
  return "exported";
}

export default function DashboardPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/folders");
      const data = await res.json();
      setFolders(data.folders || []);
    } catch (error) {
      console.error("Failed to fetch folders:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const handleBulkUploadComplete = () => {
    fetchFolders();
    setShowUpload(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このフォルダとフォルダ内のすべてのドキュメントを削除してもよろしいですか？")) return;
    setDeletingId(id);
    try {
      await fetch(`/api/folders/${id}`, { method: "DELETE" });
      setFolders((prev) => prev.filter((f) => f.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">
            アップロードされたフォルダの管理
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

      {/* フォルダ一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : folders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <FolderOpen className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            フォルダがありません
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
                    フォルダ名
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">
                    ファイル数
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    ステータス
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    作成者
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {folders.map((folder) => {
                  const folderStatus = getFolderStatus(folder.documents);
                  return (
                    <tr key={folder.id} className="border-b hover:bg-gray-50">
                      {/* 作成日 */}
                      <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                        {new Date(folder.createdAt).toLocaleDateString("ja-JP")}
                      </td>
                      {/* フォルダ名 */}
                      <td className="px-4 py-4">
                        <Link
                          href={`/folders/${folder.id}`}
                          className="flex items-center gap-2 group"
                        >
                          <FolderOpen className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                          <span className="font-medium text-gray-900 group-hover:text-blue-600 truncate max-w-[250px]">
                            {folder.name}
                          </span>
                        </Link>
                      </td>
                      {/* ファイル数 */}
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center gap-1 text-gray-600">
                          <FileText className="w-3.5 h-3.5" />
                          {folder.documents.length}
                        </span>
                      </td>
                      {/* ステータス */}
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "inline-flex px-2.5 py-1 rounded-full text-xs font-medium",
                            STATUS_COLORS[folderStatus] ||
                              "bg-gray-100 text-gray-800"
                          )}
                        >
                          {STATUS_LABELS[folderStatus] || folderStatus}
                        </span>
                      </td>
                      {/* 作成者 */}
                      <td className="px-4 py-4 text-gray-600">
                        {folder.creator || "-"}
                      </td>
                      {/* 操作 */}
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/folders/${folder.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            詳細を見る
                          </Link>
                          <button
                            onClick={() => handleDelete(folder.id)}
                            disabled={deletingId === folder.id}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {deletingId === folder.id ? (
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
