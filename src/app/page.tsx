"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { getEffectiveRole, getEffectiveUserId } from "@/lib/roleSimulation";
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
  Timer,
} from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { getSelectedClientId } from "@/lib/client";
import FileUpload from "@/components/FileUpload";
import { useWorkLogger } from "@/hooks/useWorkLogger";

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
  doubleCheckStatus: string | null;
  firstCheckById: string;
  firstCheckByName: string;
  needsDoubleCheck: boolean;
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
  const [pendingSubAccountCount, setPendingSubAccountCount] = useState(0);
  const [pendingDeletionCount, setPendingDeletionCount] = useState(0);
  const [pendingClientCount, setPendingClientCount] = useState(0);
  const [scanFiles, setScanFiles] = useState<{ name: string; size: number; modifiedAt: string }[]>([]);
  const [scanConfigured, setScanConfigured] = useState(false);
  const [scanImporting, setScanImporting] = useState(false);
  const [isWorkStarted, setIsWorkStarted] = useState(false);
  const [workSessionId, setWorkSessionId] = useState<string | null>(null);
  const [workStarting, setWorkStarting] = useState(false);

  // 作業開始後のダッシュボード滞在時間を計測
  useWorkLogger("preparation", isWorkStarted, {
    sessionId: workSessionId,
    userId: session?.user?.id || "",
    userName: session?.user?.name || "",
    userRole: userRole,
  });
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

  const fetchPendingSubAccounts = useCallback(async () => {
    if (userRole !== "admin" && userRole !== "instructor") return;
    try {
      const res = await fetch("/api/accounts/sub/pending");
      const data = await res.json();
      setPendingSubAccountCount(data.count || 0);
    } catch {
      // ignore
    }
  }, [userRole]);

  const fetchPendingDeletions = useCallback(async () => {
    if (userRole !== "admin" && userRole !== "instructor") return;
    try {
      const res = await fetch("/api/entries/delete-request/pending");
      const data = await res.json();
      setPendingDeletionCount(data.count || 0);
    } catch {
      // ignore
    }
  }, [userRole]);

  const fetchPendingClients = useCallback(async () => {
    if (userRole !== "admin" && userRole !== "instructor") return;
    try {
      const res = await fetch("/api/clients/pending");
      const data = await res.json();
      setPendingClientCount(data.count || 0);
    } catch {
      // ignore
    }
  }, [userRole]);

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

  // localStorage からセッションIDを復元（ロール変更時やセッション完了時はクリア）
  useEffect(() => {
    if (!userRole) return; // セッション読み込み待ち
    const storedSessionId = localStorage.getItem("workSessionId");
    const storedRole = localStorage.getItem("workSessionRole");
    if (!storedSessionId) return;

    // ロール情報がない（旧セッション）またはロールが変わった場合はクリア
    if (!storedRole || storedRole !== userRole) {
      localStorage.removeItem("workSessionId");
      localStorage.removeItem("workSessionRole");
      return;
    }

    // セッションがまだ有効か確認
    fetch(`/api/worksessions/${storedSessionId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const ws = data?.workSession;
        if (ws && ws.status === "active") {
          setWorkSessionId(storedSessionId);
          setIsWorkStarted(true);
        } else {
          // 完了済み or 見つからない → クリア
          localStorage.removeItem("workSessionId");
          localStorage.removeItem("workSessionRole");
        }
      })
      .catch(() => {
        // エラー時もクリア
        localStorage.removeItem("workSessionId");
        localStorage.removeItem("workSessionRole");
      });
  }, [userRole]);

  const handleWorkStart = async () => {
    setWorkStarting(true);
    try {
      const userId = session?.user?.id || "unknown";
      const userName = session?.user?.name || "";
      const res = await fetch("/api/worksessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          userName,
          userRole: userRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("WorkSession API error:", data);
        alert(`作業開始に失敗しました: ${data.error || "不明なエラー"}`);
        return;
      }
      const ws = data.workSession;
      if (ws) {
        setWorkSessionId(ws.id);
        setIsWorkStarted(true);
        setShowUpload(true);
        localStorage.setItem("workSessionId", ws.id);
        localStorage.setItem("workSessionRole", userRole);
      }
    } catch (error) {
      console.error("Failed to start work session:", error);
      alert("作業開始に失敗しました。ネットワークエラーが発生しました。");
    } finally {
      setWorkStarting(false);
    }
  };

  useEffect(() => {
    fetchFolders();
    fetchDuplicates();
    fetchPendingSubAccounts();
    fetchPendingDeletions();
    fetchPendingClients();
    checkScanFolder();

    // スキャンフォルダを5秒ごとにポーリング
    const interval = setInterval(checkScanFolder, 5000);
    return () => clearInterval(interval);
  }, [fetchFolders, fetchDuplicates, fetchPendingSubAccounts, fetchPendingDeletions, fetchPendingClients, checkScanFolder]);

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

  // B型: ダブルチェック待ちタスクの有無（ヘッダー表示制御用）
  const hasDoubleCheckTasks = useMemo(() => {
    if (userRole !== "user_b") return false;
    const effectiveId = getEffectiveUserId(session?.user?.role || "", session?.user?.id || "");
    return folders.some(
      (f) => f.doubleCheckStatus === "pending" && f.firstCheckById !== effectiveId
    );
  }, [userRole, folders, session?.user?.role, session?.user?.id]);

  return (
    <div className="space-y-6 md:space-y-8">
      {/* ヘッダー */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-foreground">ダッシュボード</h1>
          <p className="text-sm text-teal-700 mt-1">
            アップロードされたフォルダの管理
          </p>
        </div>
        {/* ダブルチェック待ちがある場合はボタンを非表示 */}
        {!hasDoubleCheckTasks && (
          <div className="relative flex-shrink-0">
            {isWorkStarted ? (
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">ファイルを</span>アップロード
              </button>
            ) : (
              <button
                onClick={handleWorkStart}
                disabled={workStarting}
                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl hover:from-amber-600 hover:to-amber-700 transition-colors text-base font-bold shadow-lg disabled:opacity-50"
              >
                {workStarting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Timer className="w-5 h-5" />
                )}
                作業開始
              </button>
            )}
            {/* ステップガイド: 作業未開始時に表示 */}
            {!isWorkStarted && !loading && (
              <div className="absolute top-full right-2 mt-3 whitespace-nowrap bg-teal-600 text-white text-sm font-medium rounded-full px-5 py-2 shadow-lg animate-bounce z-10">
                ↑ まずここから始めましょう！
                <div className="absolute bottom-full right-8 border-8 border-transparent border-b-teal-600" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 重複アラート */}
      {duplicateCount > 0 && (
        <Link
          href="/clients"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 md:px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800">
            重複の可能性がある得意先が <strong>{duplicateCount} グループ</strong>あります。
          </span>
        </Link>
      )}

      {/* 未承認補助科目アラート */}
      {pendingSubAccountCount > 0 && (userRole === "admin" || userRole === "instructor") && (
        <Link
          href="/accounts/pending"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 md:px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800">
            未承認の補助科目が <strong>{pendingSubAccountCount} 件</strong>あります。
          </span>
        </Link>
      )}

      {/* 未承認得意先アラート */}
      {pendingClientCount > 0 && (userRole === "admin" || userRole === "instructor") && (
        <Link
          href="/clients/pending"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 md:px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800">
            未承認の得意先が <strong>{pendingClientCount} 件</strong>あります。
          </span>
        </Link>
      )}

      {/* 未承認削除依頼アラート */}
      {pendingDeletionCount > 0 && (userRole === "admin" || userRole === "instructor") && (
        <Link
          href="/entries/pending-delete"
          className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 md:px-4 py-3 hover:bg-amber-100 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm text-amber-800">
            未承認の削除依頼が <strong>{pendingDeletionCount} 件</strong>あります。
          </span>
        </Link>
      )}

      {/* スキャン取り込みバナー */}
      {scanConfigured && scanFiles.length > 0 && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 md:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 md:w-10 md:h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <ScanLine className="w-4 h-4 md:w-5 md:h-5 text-teal-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-teal-900">
                  ScanSnapから {scanFiles.length} 件のファイルを検出
                </p>
                <p className="text-sm text-teal-700 mt-0.5 truncate">
                  {scanFiles.map((f) => f.name).join(", ")}
                </p>
              </div>
            </div>
            <button
              onClick={handleScanImport}
              disabled={scanImporting}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50 flex-shrink-0"
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
        <div className="card-glass rounded-xl p-4 md:p-6">
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-4">
            ファイルをアップロード（複数選択可）
          </h2>
          <FileUpload onBulkUploadComplete={handleBulkUploadComplete} />
        </div>
      )}

      {/* スキャンガイドカード */}
      <div className="card-glass rounded-xl p-4 md:p-5">
        <h3 className="text-base font-semibold text-foreground mb-3">
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
              className="flex flex-col items-center text-center gap-1.5 p-2 md:p-3 rounded-lg bg-teal-50/50"
            >
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-teal-100 flex items-center justify-center">
                <Icon className="w-4 h-4 md:w-5 md:h-5 text-teal-600" />
              </div>
              <div>
                <span className="text-xs font-bold text-teal-600">
                  Step {step}
                </span>
                <p className="text-xs md:text-sm text-gray-700 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* フォルダ一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : folders.length === 0 ? (
        <div className="text-center py-12 md:py-16 card-glass rounded-xl">
          <FolderOpen className="mx-auto h-12 w-12 md:h-16 md:w-16 text-teal-300 mb-4" />
          <h3 className="text-base md:text-lg font-medium text-foreground mb-2">
            フォルダがありません
          </h3>
          <p className="text-xs md:text-sm text-teal-700 mb-6 px-4">
            PDF・画像ファイルをアップロードして記帳作業を始めましょう
          </p>
          {isWorkStarted ? (
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
            >
              <Upload className="w-4 h-4" />
              アップロード
            </button>
          ) : (
            <button
              onClick={handleWorkStart}
              disabled={workStarting}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl hover:from-amber-600 hover:to-amber-700 transition-colors text-base font-bold shadow-lg disabled:opacity-50"
            >
              {workStarting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Timer className="w-5 h-5" />
              )}
              作業開始
            </button>
          )}
        </div>
      ) : userRole === "user_b" ? (
        /* ===== B型専用: タスク状況別ビュー ===== */
        (() => {
          const effectiveId = getEffectiveUserId(session?.user?.role || "", session?.user?.id || "");
          // B型のフォルダを4カテゴリに分類
          const incompleteFolders = folders.filter(
            (f) => f.handoffStatus !== "handed_off" && f.doubleCheckStatus !== "pending"
          );
          const doubleCheckWaiting = folders.filter(
            (f) => f.doubleCheckStatus === "pending" && f.firstCheckById !== effectiveId
          );
          const waitingForOthers = folders.filter(
            (f) => f.doubleCheckStatus === "pending" && f.firstCheckById === effectiveId
          );
          const completedFolders = folders.filter((f) => f.handoffStatus === "handed_off");

          // 未完了フォルダのサブ分類（バッジ用）
          const getBTypeBadge = (f: Folder): { label: string; color: string } => {
            if (f.documents.length === 0) return { label: "ファイルなし", color: "bg-gray-100 text-gray-600" };
            if (f.doubleCheckStatus === "completed") return { label: "引き継ぎ可能", color: "bg-green-100 text-green-800" };
            const hasIncomplete = f.documents.some(
              (d) => d.status === "uploaded" || d.status === "ocr_processing" || d.status === "ocr_complete"
            );
            if (hasIncomplete) {
              const status = getFolderStatus(f);
              return { label: STATUS_LABELS[status] || status, color: STATUS_COLORS[status] || "bg-gray-100 text-gray-800" };
            }
            return { label: "引き継ぎ可能", color: "bg-green-100 text-green-800" };
          };

          const renderFolderCard = (folder: Folder, badge?: { label: string; color: string }, subText?: string) => (
            <Link
              key={folder.id}
              href={`/folders/${folder.id}`}
              className="flex items-center justify-between gap-3 card-glass rounded-xl p-3 md:p-4 hover:bg-teal-50/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FolderOpen className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-medium text-gray-900 truncate">{folder.name}</p>
                    {badge && (
                      <span className={cn("inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium", badge.color)}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                    {subText && <span className="text-orange-700">{subText}</span>}
                    <span>{new Date(folder.createdAt).toLocaleDateString("ja-JP")}</span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
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
              {/* 未完了タスク */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <h2 className="text-base md:text-lg font-bold text-foreground">未完了タスク</h2>
                  {incompleteFolders.length > 0 && (
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 text-sm font-bold text-white bg-amber-500 rounded-full">
                      {incompleteFolders.length}
                    </span>
                  )}
                </div>
                {incompleteFolders.length === 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <p className="text-sm text-green-700">すべてのタスクが完了しています</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {incompleteFolders.map((f, idx) => (
                      <div key={f.id} className="relative">
                        {renderFolderCard(f, getBTypeBadge(f))}
                        {idx === 0 && (
                          <div className="absolute left-4 -bottom-2 translate-y-full bg-teal-600 text-white text-sm font-medium rounded-full px-4 py-1.5 shadow-lg animate-bounce z-10">
                            このフォルダを開いて確認しましょう →
                            <div className="absolute bottom-full left-6 border-8 border-transparent border-b-teal-600" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ダブルチェック待ち */}
              {doubleCheckWaiting.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-500" />
                    <h2 className="text-base md:text-lg font-bold text-foreground">ダブルチェック待ち</h2>
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 text-sm font-bold text-white bg-orange-500 rounded-full">
                      {doubleCheckWaiting.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {doubleCheckWaiting.map((f, idx) => (
                      <div key={f.id} className="relative">
                        {renderFolderCard(
                          f,
                          { label: "ダブルチェック", color: "bg-orange-100 text-orange-800" },
                          `1stチェック: ${f.firstCheckByName}`
                        )}
                        {idx === 0 && (
                          <div className="absolute left-4 -bottom-2 translate-y-full bg-teal-600 text-white text-sm font-medium rounded-full px-4 py-1.5 shadow-lg animate-bounce z-10">
                            ダブルチェックを行いましょう →
                            <div className="absolute bottom-full left-6 border-8 border-transparent border-b-teal-600" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 待機中（自分が1stチェック者） */}
              {waitingForOthers.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <h2 className="text-base md:text-lg font-bold text-foreground">待機中</h2>
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 text-sm font-bold text-white bg-gray-400 rounded-full">
                      {waitingForOthers.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {waitingForOthers.map((f) => renderFolderCard(
                      f,
                      { label: "2ndチェック待ち", color: "bg-gray-100 text-gray-600" }
                    ))}
                  </div>
                </div>
              )}

              {/* 完了済みタスク */}
              {completedFolders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-500" />
                    <h2 className="text-base md:text-lg font-bold text-foreground">完了済み</h2>
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 text-sm font-bold text-white bg-green-500 rounded-full">
                      {completedFolders.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {completedFolders.map((f) => renderFolderCard(f, {
                      label: "引き継ぎ済",
                      color: "bg-cyan-100 text-cyan-800",
                    }))}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      ) : userRole === "user_a" ? (
        /* ===== A型専用: タスク状況別ビュー ===== */
        (() => {
          const isFolderCompleted = (f: Folder) =>
            f.documents.length > 0 &&
            f.documents.every((d) => d.status === "exported" || d.status === "reviewed");

          // 引き継ぎフォルダ（未処理のみ）
          const handoffPending = folders.filter(
            (f) => f.handoffStatus === "handed_off" && !isFolderCompleted(f)
          );
          // 自分の作業中フォルダ（引き継ぎ以外の未完了）
          const ownIncomplete = folders.filter(
            (f) => f.handoffStatus !== "handed_off" && !isFolderCompleted(f)
          );
          // 完了済み（引き継ぎ・自作問わず）
          const completedFolders = folders.filter((f) => isFolderCompleted(f));

          const getATypeBadge = (f: Folder): { label: string; color: string } => {
            if (f.documents.length === 0) return { label: "ファイルなし", color: "bg-gray-100 text-gray-600" };
            if (f.handoffStatus === "handed_off" && f.needsDoubleCheck) return { label: "要ダブルチェック", color: "bg-orange-100 text-orange-800" };
            const status = getFolderStatus(f);
            if (f.handoffStatus === "handed_off") return { label: "引き継ぎ", color: "bg-cyan-100 text-cyan-800" };
            return { label: STATUS_LABELS[status] || status, color: STATUS_COLORS[status] || "bg-gray-100 text-gray-800" };
          };

          const renderFolderCard = (folder: Folder, badge?: { label: string; color: string }, isHandoff?: boolean) => (
            <Link
              key={folder.id}
              href={`/folders/${folder.id}`}
              className={cn(
                "flex items-center justify-between gap-3 rounded-xl border p-3 md:p-4 transition-colors",
                isHandoff
                  ? "bg-cyan-50 border-cyan-200 hover:bg-cyan-100"
                  : "card-glass hover:bg-teal-50/50"
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                {isHandoff ? (
                  <Send className="w-5 h-5 text-cyan-600 flex-shrink-0" />
                ) : (
                  <FolderOpen className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-medium text-gray-900 truncate">{folder.name}</p>
                    {badge && (
                      <span className={cn("inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium", badge.color)}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500 mt-0.5">
                    {isHandoff && folder.handoffBy && (
                      <span>引継元: {folder.handoffBy}</span>
                    )}
                    <span>{new Date(folder.createdAt).toLocaleDateString("ja-JP")}</span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
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

          const incompleteFolders = [...handoffPending, ...ownIncomplete];

          return (
            <div className="space-y-6">
              {/* 未完了タスク */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  <h2 className="text-base md:text-lg font-bold text-foreground">未完了タスク</h2>
                  {incompleteFolders.length > 0 && (
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 text-sm font-bold text-white bg-amber-500 rounded-full">
                      {incompleteFolders.length}
                    </span>
                  )}
                </div>
                {incompleteFolders.length === 0 ? (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <p className="text-sm text-green-700">すべてのタスクが完了しています</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {incompleteFolders.map((f, idx) => (
                      <div key={f.id} className="relative">
                        {renderFolderCard(f, getATypeBadge(f), f.handoffStatus === "handed_off")}
                        {idx === 0 && (
                          <div className="absolute left-4 -bottom-2 translate-y-full bg-teal-600 text-white text-sm font-medium rounded-full px-4 py-1.5 shadow-lg animate-bounce z-10">
                            {f.handoffStatus === "handed_off"
                              ? "引き継ぎフォルダを確認しましょう →"
                              : "このフォルダを開いて作業しましょう →"
                            }
                            <div className="absolute bottom-full left-6 border-8 border-transparent border-b-teal-600" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 完了済み */}
              {completedFolders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-5 h-5 text-green-500" />
                    <h2 className="text-base md:text-lg font-bold text-foreground">完了済み</h2>
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 text-sm font-bold text-white bg-green-500 rounded-full">
                      {completedFolders.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {completedFolders.map((f) => renderFolderCard(f, {
                      label: f.handoffStatus === "handed_off" ? "引き継ぎ完了" : "エクスポート済",
                      color: f.handoffStatus === "handed_off" ? "bg-cyan-100 text-cyan-800" : "bg-emerald-100 text-emerald-800",
                    }))}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      ) : (
        /* ===== 管理者等のフォルダ一覧 ===== */
        <>
          {/* デスクトップ: テーブル表示 */}
          <div className="hidden md:block card-glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-teal-50/80 border-b">
                    <th className="px-4 py-3 text-left font-medium text-teal-800">作成日</th>
                    <th className="px-4 py-3 text-left font-medium text-teal-800">フォルダ名</th>
                    <th className="px-4 py-3 text-center font-medium text-teal-800">ファイル数</th>
                    <th className="px-4 py-3 text-left font-medium text-teal-800">ステータス</th>
                    <th className="px-4 py-3 text-left font-medium text-teal-800">作成者</th>
                    <th className="px-4 py-3 text-center font-medium text-teal-800">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {folders.map((folder) => {
                    const folderStatus = getFolderStatus(folder);
                    return (
                      <tr key={folder.id} className="border-b hover:bg-teal-50/50">
                        <td className="px-4 py-4 text-teal-700 whitespace-nowrap">
                          {new Date(folder.createdAt).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="px-4 py-4">
                          <Link href={`/folders/${folder.id}`} className="flex items-center gap-2 group">
                            <FolderOpen className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                            <span className="font-medium text-foreground group-hover:text-teal-600 truncate max-w-[250px]">
                              {folder.name}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className="inline-flex items-center gap-1 text-teal-700">
                            <FileText className="w-3.5 h-3.5" />
                            {folder.documents.length}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-medium", STATUS_COLORS[folderStatus] || "bg-gray-100 text-gray-800")}>
                            {STATUS_LABELS[folderStatus] || folderStatus}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-teal-700">{folder.creator || "-"}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={`/folders/${folder.id}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
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
                <div key={folder.id} className="card-glass rounded-xl overflow-hidden">
                  <Link href={`/folders/${folder.id}`} className="block p-4 active:bg-teal-50/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                          <span className="font-medium text-foreground text-sm truncate">
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
