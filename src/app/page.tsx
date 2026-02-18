"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getEffectiveRole } from "@/lib/roleSimulation";
import {
  FolderOpen,
  Upload,
  Trash2,
  Loader2,
  FileText,
  AlertTriangle,
  ScanLine,
  ChevronRight,
  Power,
  FileStack,
  Play,
  MonitorSmartphone,
  Send,
  ArrowRight,
  Check,
  Clock,
} from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { getSelectedClientId } from "@/lib/client";
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
  handoffStatus: string | null;
  handoffBy: string;
  handoffAt: string | null;
  documents: FolderDocument[];
}

function getFolderStatus(folder: Folder): string {
  if (folder.handoffStatus === "handed_off") return "handed_off";
  const documents = folder.documents;
  if (documents.length === 0) return "uploaded";
  const statuses = documents.map((d) => d.status);
  // 優先度順: 処理中 > アップロード済 > OCR完了 > OCR確認完了 > 仕訳済 > 確認済 > エクスポート済
  if (statuses.some((s) => s === "ocr_processing")) return "ocr_processing";
  if (statuses.some((s) => s === "uploaded")) return "uploaded";
  if (statuses.some((s) => s === "ocr_complete")) return "ocr_complete";
  if (statuses.some((s) => s === "ocr_confirmed")) return "ocr_confirmed";
  if (statuses.some((s) => s === "classified")) return "classified";
  if (statuses.some((s) => s === "reviewed")) return "reviewed";
  return "exported";
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = getEffectiveRole(session?.user?.role || "");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [scanFiles, setScanFiles] = useState<{ name: string; size: number; modifiedAt: string }[]>([]);
  const [scanConfigured, setScanConfigured] = useState(false);
  const [scanImporting, setScanImporting] = useState(false);
  const checkScanFolder = useCallback(async () => {
    try {
      const res = await fetch("/api/scan");
      const data = await res.json();
      setScanConfigured(data.configured);
      setScanFiles(data.files || []);
    } catch {
      // ignore
    }
  }, []);

  const handleScanImport = async () => {
    setScanImporting(true);
    try {
      const clientId = getSelectedClientId();
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "取り込みに失敗しました");
        return;
      }
      // 取り込み完了 → フォルダ詳細ページへ（OCR自動開始）
      router.push(`/folders/${data.folder.id}`);
    } catch {
      alert("取り込みに失敗しました");
    } finally {
      setScanImporting(false);
    }
  };

  const fetchDuplicates = useCallback(async () => {
    try {
      const res = await fetch("/api/clients/duplicates");
      const data = await res.json();
      setDuplicateCount((data.groups || []).length);
    } catch {
      // ignore
    }
  }, []);

  const fetchFolders = useCallback(async () => {
    try {
      const clientId = getSelectedClientId();
      const url = clientId ? `/api/folders?clientId=${clientId}` : "/api/folders";
      const res = await fetch(url);
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
    fetchDuplicates();
    checkScanFolder();

    // スキャンフォルダを5秒ごとにポーリング
    const interval = setInterval(checkScanFolder, 5000);
    return () => clearInterval(interval);
  }, [fetchFolders, fetchDuplicates, checkScanFolder]);

  const handleBulkUploadComplete = (folderId: string) => {
    // アップロード完了後、フォルダ詳細ページへ遷移（OCRはそこで自動開始）
    router.push(`/folders/${folderId}`);
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
    <div className="space-y-6 md:space-y-8">
      {/* ヘッダー */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">ダッシュボード</h1>
          <p className="text-xs md:text-sm text-gray-500 mt-1">
            アップロードされたフォルダの管理
          </p>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs md:text-sm font-medium flex-shrink-0"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">ファイルを</span>アップロード
        </button>
      </div>

      {/* 重複アラート */}
      {duplicateCount > 0 && (
        <Link
          href="/clients"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 md:px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-xs md:text-sm text-amber-800">
            重複の可能性がある得意先が <strong>{duplicateCount} グループ</strong>あります。
          </span>
        </Link>
      )}

      {/* スキャン取り込みバナー */}
      {scanConfigured && scanFiles.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 md:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 md:w-10 md:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <ScanLine className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs md:text-sm font-medium text-blue-900">
                  ScanSnapから {scanFiles.length} 件のファイルを検出
                </p>
                <p className="text-xs text-blue-700 mt-0.5 truncate">
                  {scanFiles.map((f) => f.name).join(", ")}
                </p>
              </div>
            </div>
            <button
              onClick={handleScanImport}
              disabled={scanImporting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 md:px-5 md:py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs md:text-sm font-medium disabled:opacity-50 flex-shrink-0"
            >
              {scanImporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ScanLine className="w-4 h-4" />
              )}
              取り込み開始
            </button>
          </div>
        </div>
      )}

      {/* アップロードエリア */}
      {showUpload && (
        <div className="bg-white rounded-xl border p-4 md:p-6">
          <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-4">
            ファイルをアップロード（複数選択可）
          </h2>
          <FileUpload onBulkUploadComplete={handleBulkUploadComplete} />
        </div>
      )}

      {/* スキャンガイドカード */}
      <div className="bg-white rounded-xl border p-4 md:p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          スキャンの流れ
        </h3>
        <div className="grid grid-cols-4 gap-2 md:gap-4">
          {[
            { icon: Power, label: "電源を入れる", step: 1 },
            { icon: FileStack, label: "書類をセット", step: 2 },
            { icon: Play, label: "スキャン開始", step: 3 },
            { icon: MonitorSmartphone, label: "自動で取込", step: 4 },
          ].map(({ icon: Icon, label, step }) => (
            <div
              key={step}
              className="flex flex-col items-center text-center gap-1.5 p-2 md:p-3 rounded-lg bg-gray-50"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Icon className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-blue-600">
                  Step {step}
                </span>
                <p className="text-[10px] md:text-xs text-gray-700 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* A型: 引き継ぎフォルダセクション */}
      {userRole === "user_a" && (() => {
        const handoffFolders = folders.filter((f) => f.handoffStatus === "handed_off");
        if (handoffFolders.length === 0) return null;
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base md:text-lg font-bold text-gray-900">引き継ぎフォルダ</h2>
              <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-white bg-cyan-500 rounded-full">
                {handoffFolders.length}
              </span>
            </div>
            <div className="space-y-2">
              {handoffFolders.map((f) => (
                <Link
                  key={f.id}
                  href={`/folders/${f.id}`}
                  className="flex items-center justify-between gap-3 bg-cyan-50 border border-cyan-200 rounded-xl p-3 md:p-4 hover:bg-cyan-100 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Send className="w-5 h-5 text-cyan-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{f.name}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span>引継元: {f.handoffBy || "-"}</span>
                        {f.handoffAt && (
                          <span>{new Date(f.handoffAt).toLocaleString("ja-JP")}</span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {f.documents.length}件
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      {/* フォルダ一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : folders.length === 0 ? (
        <div className="text-center py-12 md:py-16 bg-white rounded-xl border">
          <FolderOpen className="mx-auto h-12 w-12 md:h-16 md:w-16 text-gray-300 mb-4" />
          <h3 className="text-base md:text-lg font-medium text-gray-700 mb-2">
            フォルダがありません
          </h3>
          <p className="text-xs md:text-sm text-gray-500 mb-6 px-4">
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
      ) : userRole === "user_b" ? (
        /* ===== B型専用: タスク状況別ビュー ===== */
        (() => {
          // B型のフォルダを3カテゴリに分類
          const ocrIncompleteFolders = folders.filter((f) => {
            if (f.handoffStatus === "handed_off") return false;
            if (f.documents.length === 0) return true;
            return f.documents.some(
              (d) =>
                d.status === "uploaded" ||
                d.status === "ocr_processing" ||
                d.status === "ocr_complete"
            );
          });
          const readyForHandoff = folders.filter((f) => {
            if (f.handoffStatus === "handed_off") return false;
            if (f.documents.length === 0) return false;
            return f.documents.every(
              (d) =>
                d.status === "ocr_confirmed" ||
                d.status === "classified" ||
                d.status === "reviewed" ||
                d.status === "exported"
            );
          });
          const handedOff = folders.filter((f) => f.handoffStatus === "handed_off");

          const renderFolderCard = (folder: Folder, badge?: { label: string; color: string }) => (
            <Link
              key={folder.id}
              href={`/folders/${folder.id}`}
              className="flex items-center justify-between gap-3 bg-white rounded-xl border p-3 md:p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FolderOpen className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{folder.name}</p>
                    {badge && (
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium", badge.color)}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    <span>{new Date(folder.createdAt).toLocaleDateString("ja-JP")}</span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {folder.documents.length}件
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(folder.id); }}
                  disabled={deletingId === folder.id}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deletingId === folder.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </Link>
          );

          return (
            <div className="space-y-6">
              {/* OCR確認待ち（未完了タスク） */}
              {ocrIncompleteFolders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-500" />
                    <h2 className="text-base md:text-lg font-bold text-gray-900">OCR確認待ち</h2>
                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-white bg-amber-500 rounded-full">
                      {ocrIncompleteFolders.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {ocrIncompleteFolders.map((f) => {
                      const status = getFolderStatus(f);
                      return renderFolderCard(f, {
                        label: STATUS_LABELS[status] || status,
                        color: STATUS_COLORS[status] || "bg-gray-100 text-gray-800",
                      });
                    })}
                  </div>
                </div>
              )}

              {/* 引き継ぎ可能（完了タスク） */}
              {readyForHandoff.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Send className="w-5 h-5 text-green-500" />
                    <h2 className="text-base md:text-lg font-bold text-gray-900">引き継ぎ可能</h2>
                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-white bg-green-500 rounded-full">
                      {readyForHandoff.length}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 -mt-1">OCR確認が完了しています。フォルダを開いてA型利用者に引き継ぎしてください。</p>
                  <div className="space-y-2">
                    {readyForHandoff.map((f) => renderFolderCard(f, {
                      label: "引き継ぎ可能",
                      color: "bg-green-100 text-green-800",
                    }))}
                  </div>
                </div>
              )}

              {/* 引き継ぎ済 */}
              {handedOff.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-cyan-500" />
                    <h2 className="text-base md:text-lg font-bold text-gray-900">引き継ぎ済</h2>
                    <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold text-white bg-cyan-500 rounded-full">
                      {handedOff.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {handedOff.map((f) => renderFolderCard(f, {
                      label: "引き継ぎ済",
                      color: "bg-cyan-100 text-cyan-800",
                    }))}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      ) : (
        /* ===== 通常のフォルダ一覧（A型・管理者等） ===== */
        <>
          {/* デスクトップ: テーブル表示 */}
          <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">作成日</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">フォルダ名</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">ファイル数</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">ステータス</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">作成者</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {folders.map((folder) => {
                    const folderStatus = getFolderStatus(folder);
                    return (
                      <tr key={folder.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                          {new Date(folder.createdAt).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="px-4 py-4">
                          <Link href={`/folders/${folder.id}`} className="flex items-center gap-2 group">
                            <FolderOpen className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                            <span className="font-medium text-gray-900 group-hover:text-blue-600 truncate max-w-[250px]">
                              {folder.name}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <FileText className="w-3.5 h-3.5" />
                            {folder.documents.length}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-medium", STATUS_COLORS[folderStatus] || "bg-gray-100 text-gray-800")}>
                            {STATUS_LABELS[folderStatus] || folderStatus}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-gray-600">{folder.creator || "-"}</td>
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

          {/* モバイル: カード表示 */}
          <div className="md:hidden space-y-3">
            {folders.map((folder) => {
              const folderStatus = getFolderStatus(folder);
              return (
                <div key={folder.id} className="bg-white rounded-xl border overflow-hidden">
                  <Link href={`/folders/${folder.id}`} className="block p-4 active:bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                          <span className="font-medium text-gray-900 text-sm truncate">
                            {folder.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>{new Date(folder.createdAt).toLocaleDateString("ja-JP")}</span>
                          <span className="inline-flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {folder.documents.length}件
                          </span>
                          {folder.creator && <span>{folder.creator}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium", STATUS_COLORS[folderStatus] || "bg-gray-100 text-gray-800")}>
                          {STATUS_LABELS[folderStatus] || folderStatus}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </Link>
                  <div className="border-t px-4 py-2 flex justify-end">
                    <button
                      onClick={(e) => { e.preventDefault(); handleDelete(folder.id); }}
                      disabled={deletingId === folder.id}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                    >
                      {deletingId === folder.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
