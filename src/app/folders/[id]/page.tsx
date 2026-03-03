"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getEffectiveRole, getEffectiveUserId, getEffectiveUserName, SIMULATION_PERSONAS } from "@/lib/roleSimulation";
import {
  FileText,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Loader2,
  Download,
  FolderOpen,
  PlayCircle,
  Sparkles,
  Check,
  Pencil,
  X,
  AlertTriangle,
  CircleAlert,
  Send,
  Clock,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Hand,
} from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS, formatCurrency } from "@/lib/utils";
import { getSelectedClientId } from "@/lib/client";
import Image from "next/image";
import OCREditor, { type PageUpdateData } from "@/components/OCREditor";
import SubAccountCombobox from "@/components/SubAccountCombobox";
import MismatchAlert from "@/components/MismatchAlert";
import { useWorkLogger } from "@/hooks/useWorkLogger";

interface AccountData {
  id: string;
  code: string;
  name: string;
  category: string;
  subAccounts: { id: string; code: string; name: string }[];
}

const CATEGORY_ORDER = ["費用", "資産", "負債", "収益", "純資産"];
const TAX_RATE_OPTIONS = ["課税10%", "課税8%", "非課税", "不課税", "免税"];

interface JournalEntryData {
  id: string;
  pageId: string | null;
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
  aiReasoning: string;
  isConfirmed: boolean;
  duplicateDismissed: boolean;
}

interface Document {
  id: string;
  filename: string;
  filepath: string;
  fileType: string;
  title: string;
  creator: string;
  status: string;
  createdAt: string;
  pages: { id: string; imagePath: string; pageNumber: number }[];
  _count: { journalEntries: number };
  journalEntries: JournalEntryData[];
}

interface Page {
  id: string;
  pageNumber: number;
  imagePath: string;
  ocrText: string;
  correctedText: string;
  isConfirmed: boolean;
  isDoubleChecked?: boolean;
  date: string;
  registrationNumber: string;
  amount: string;
  tax: string;
  memo: string;
}

interface FullDocument {
  id: string;
  filename: string;
  filepath: string;
  fileType: string;
  status: string;
  pages: Page[];
}

interface Folder {
  id: string;
  name: string;
  creator: string;
  createdAt: string;
  clientId: string | null;
  client: { id: string; name: string } | null;
  handoffStatus: string | null;
  handoffBy: string;
  handoffAt: string | null;
  doubleCheckStatus: string | null;
  firstCheckById: string;
  firstCheckByName: string;
  firstCheckAt: string | null;
  doubleCheckById: string;
  doubleCheckByName: string;
  doubleCheckAt: string | null;
  needsDoubleCheck: boolean;
  documents: Document[];
}

export default function FolderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = getEffectiveRole(session?.user?.role || "");
  const effectiveUserId = getEffectiveUserId(session?.user?.role || "", session?.user?.id || "");
  const effectiveUserName = getEffectiveUserName(session?.user?.role || "", session?.user?.name || "");
  // B型利用者は仕訳関連セクションを非表示
  const canViewJournal = userRole !== "user_b";
  const [folder, setFolder] = useState<Folder | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ocrProcessingIds, setOcrProcessingIds] = useState<Set<string>>(new Set());
  const [ocrErrors, setOcrErrors] = useState<Record<string, string>>({});
  const ocrStartedRef = useRef(false);
  const [ocrDocsData, setOcrDocsData] = useState<Record<string, FullDocument>>({});
  const [detailEntry, setDetailEntry] = useState<(JournalEntryData & { documentId: string; filename: string; filepath: string; fileType: string; pages: { id: string; imagePath: string; pageNumber: number }[] }) | null>(null);
  const [editForm, setEditForm] = useState<Partial<JournalEntryData>>({});
  const [savingEntry, setSavingEntry] = useState(false);
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loadingOcrDocs, setLoadingOcrDocs] = useState(false);
  const [fullyConfirmedDocIds, setFullyConfirmedDocIds] = useState<Set<string>>(new Set());
  const confirmedProcessedRef = useRef<Set<string>>(new Set());
  const [duplicateCompare, setDuplicateCompare] = useState<{
    entry: JournalEntryData & { documentId: string; filename: string; filepath: string; fileType: string; pages: { id: string; imagePath: string; pageNumber: number }[] };
    paired: JournalEntryData & { documentId: string; filename: string; filepath: string; fileType: string; pages: { id: string; imagePath: string; pageNumber: number }[] };
  } | null>(null);
  const [dismissingDuplicate, setDismissingDuplicate] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState<Record<string, { scale: number; x: number; y: number }>>({});
  const [pendingDeletionEntryIds, setPendingDeletionEntryIds] = useState<Set<string>>(new Set());
  const [pendingDeletionMap, setPendingDeletionMap] = useState<Map<string, string>>(new Map()); // entryId → deletionRequestId
  const [requestingDeleteId, setRequestingDeleteId] = useState<string | null>(null);
  const [approvingDeleteId, setApprovingDeleteId] = useState<string | null>(null);
  const [hasUnresolvedAlerts, setHasUnresolvedAlerts] = useState(false);
  const [handingOff, setHandingOff] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [userBCount, setUserBCount] = useState<number | null>(null);
  const [firstCheckCompleting, setFirstCheckCompleting] = useState(false);
  const [doubleCheckCompleting, setDoubleCheckCompleting] = useState(false);
  const [updatingNeedsDoubleCheck, setUpdatingNeedsDoubleCheck] = useState(false);

  // 工数記録: ロールに応じてworkTypeを切り替え
  const workType = userRole === "user_b" ? "ocr_review" : "review";
  useWorkLogger(workType, true, {
    sessionId: typeof window !== "undefined" ? localStorage.getItem("workSessionId") : null,
    userId: session?.user?.id || "",
    userName: session?.user?.name || "",
    userRole: userRole,
    folderId: id,
  });

  const fetchFolder = useCallback(async () => {
    try {
      setFetchError(null);
      const res = await fetch(`/api/folders/${id}`);
      const data = await res.json();

      if (!res.ok) {
        setFetchError(`API Error ${res.status}: ${data.error || ""} ${data.detail || ""}`);
        setFolder(null);
        return null;
      }

      const folderData = data.folder as Folder | null;

      // 仕訳済み以降で仕訳が0件のドキュメントを自動クリーンアップ
      if (folderData) {
        try {
          const orphanedDocs = folderData.documents.filter(
            (d) =>
              (d.status === "classified" || d.status === "reviewed" || d.status === "exported") &&
              (!d.journalEntries || d.journalEntries.length === 0)
          );
          if (orphanedDocs.length > 0) {
            await Promise.all(
              orphanedDocs.map((d) => fetch(`/api/documents/${d.id}`, { method: "DELETE" }))
            );
            folderData.documents = folderData.documents.filter(
              (d) => !orphanedDocs.some((o) => o.id === d.id)
            );
          }
        } catch (cleanupErr) {
          console.error("Cleanup failed (non-fatal):", cleanupErr);
        }
      }

      setFolder(folderData);
      return folderData;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setFetchError(`Fetch failed: ${msg}`);
      console.error("Failed to fetch folder:", error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  /** 未承認削除依頼のエントリIDを取得 */
  const fetchPendingDeletions = useCallback(async () => {
    try {
      const res = await fetch("/api/entries/delete-request/pending?detail=true");
      const data = await res.json();
      const items = data.items || [];
      const ids = new Set<string>(items.map((r: { entryId: string }) => r.entryId));
      const map = new Map<string, string>(items.map((r: { id: string; entryId: string }) => [r.entryId, r.id]));
      setPendingDeletionEntryIds(ids);
      setPendingDeletionMap(map);
    } catch {
      // ignore
    }
  }, []);

  /** 勘定科目マスター取得 */
  const fetchAccounts = useCallback(async () => {
    const clientId = getSelectedClientId();
    const url = clientId ? `/api/accounts?clientId=${clientId}` : "/api/accounts";
    const res = await fetch(url);
    const data = await res.json();
    setAccounts((data.accounts || []) as AccountData[]);
  }, []);

  /** 詳細モーダルを開く */
  const openDetail = useCallback((entry: typeof detailEntry) => {
    if (!entry) return;
    setDetailEntry(entry);
    setEditForm({
      date: entry.date,
      description: entry.description,
      accountCode: entry.accountCode,
      accountName: entry.accountName,
      subAccountCode: entry.subAccountCode,
      subAccountName: entry.subAccountName,
      debitAmount: entry.debitAmount,
      creditAmount: entry.creditAmount,
      taxRate: entry.taxRate,
    });
    // accounts未取得なら取得
    if (accounts.length === 0) fetchAccounts();
  }, [accounts.length, fetchAccounts]);

  /** 仕訳エントリ更新 */
  const handleUpdateEntry = useCallback(async () => {
    if (!detailEntry) return;
    setSavingEntry(true);
    try {
      const payload: Record<string, unknown> = { id: detailEntry.id };
      for (const [key, value] of Object.entries(editForm)) {
        if (key === "debitAmount" || key === "creditAmount") {
          payload[key] = Number(value) || 0;
        } else {
          payload[key] = value;
        }
      }
      const res = await fetch("/api/entries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("更新に失敗しました");

      // フォルダデータを再取得して反映
      await fetchFolder();
      setDetailEntry(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setSavingEntry(false);
    }
  }, [detailEntry, editForm, fetchFolder]);

  /** 1件のドキュメント詳細を取得し ocrDocsData に追加 */
  const fetchDocFullData = useCallback(async (docId: string) => {
    try {
      const res = await fetch(`/api/documents/${docId}`);
      const data = await res.json();
      if (data.document) {
        setOcrDocsData((prev) => ({ ...prev, [docId]: data.document }));
      }
    } catch (error) {
      console.error("Failed to fetch document:", error);
    }
  }, []);

  /** 1件のドキュメントのOCRを実行 */
  const runOCR = useCallback(async (docId: string) => {
    setOcrProcessingIds((prev) => new Set(prev).add(docId));
    setOcrErrors((prev) => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });

    // ステータスをUIで即座に反映
    setFolder((prev) =>
      prev
        ? {
            ...prev,
            documents: prev.documents.map((d) =>
              d.id === docId ? { ...d, status: "ocr_processing" } : d
            ),
          }
        : null
    );

    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error(`OCR処理に失敗しました (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail ? ` (${data.detail})` : "";
        throw new Error(`${data.error || "OCR処理に失敗しました"}${detail}`);
      }

      // 成功: ステータスを更新
      setFolder((prev) =>
        prev
          ? {
              ...prev,
              documents: prev.documents.map((d) =>
                d.id === docId ? { ...d, status: "ocr_complete" } : d
              ),
            }
          : null
      );

      // OCR完了したドキュメントの詳細を取得してリストに追加
      await fetchDocFullData(docId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "OCR失敗";
      setOcrErrors((prev) => ({ ...prev, [docId]: message }));

      // エラー: ステータスをuploadedに戻す
      setFolder((prev) =>
        prev
          ? {
              ...prev,
              documents: prev.documents.map((d) =>
                d.id === docId ? { ...d, status: "uploaded" } : d
              ),
            }
          : null
      );
    } finally {
      setOcrProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  }, [fetchDocFullData]);

  /** uploaded状態のドキュメントを順次OCR実行 */
  const startAutoOCR = useCallback(
    async (docs: Document[]) => {
      const uploadedDocs = docs.filter((d) => d.status === "uploaded");
      for (const doc of uploadedDocs) {
        await runOCR(doc.id);
      }
    },
    [runOCR]
  );

  // B型ユーザー数を取得（シミュレーション中はペルソナ数を使用）
  useEffect(() => {
    if (session?.user?.role === "admin" && userRole === "user_b") {
      setUserBCount(SIMULATION_PERSONAS.user_b.length);
      return;
    }
    fetch("/api/users/count-by-role?role=user_b")
      .then((res) => res.json())
      .then((data) => setUserBCount(data.count ?? 0))
      .catch(() => setUserBCount(0));
  }, [session?.user?.role, userRole]);

  // 初回ロード時に自動OCR開始 & OCR完了ドキュメントの詳細を一括取得
  useEffect(() => {
    fetchPendingDeletions();
    fetchFolder().then(async (folderData) => {
      if (!folderData) return;

      // OCR完了済み（未確認 + 確認済み）のドキュメント詳細を取得
      // 確認済みは読み取り専用で表示、仕訳済み以降は不要
      const ocrDocs = folderData.documents.filter(
        (d: Document) => d.status === "ocr_complete" || d.status === "ocr_confirmed"
      );
      if (ocrDocs.length > 0) {
        setLoadingOcrDocs(true);
        await Promise.all(ocrDocs.map((d: Document) => fetchDocFullData(d.id)));
        setLoadingOcrDocs(false);
      }

      // ocr_confirmed 以降のドキュメントを fullyConfirmedDocIds に初期登録
      const confirmedIds = folderData.documents
        .filter((d: Document) => d.status !== "uploaded" && d.status !== "ocr_processing" && d.status !== "ocr_complete")
        .map((d: Document) => d.id);
      if (confirmedIds.length > 0) {
        setFullyConfirmedDocIds(new Set(confirmedIds));
      }

      // uploaded状態のドキュメントの自動OCR
      if (!ocrStartedRef.current) {
        const uploadedDocs = folderData.documents.filter(
          (d: Document) => d.status === "uploaded"
        );
        if (uploadedDocs.length > 0) {
          ocrStartedRef.current = true;
          startAutoOCR(folderData.documents);
        }
      }
    });
  }, [fetchFolder, startAutoOCR, fetchDocFullData]);

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
      setOcrDocsData((prev) => {
        const next = { ...prev };
        delete next[docId];
        return next;
      });
      setFullyConfirmedDocIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    } finally {
      setDeletingId(null);
    }
  };

  /** 手動でOCRを再実行 */
  const handleManualOCR = async (docId: string) => {
    await runOCR(docId);
  };

  /** ページデータ保存 */
  const handlePageUpdate = async (pageId: string, data: PageUpdateData) => {
    const res = await fetch("/api/ocr/pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, ...data }),
    });
    if (!res.ok) {
      throw new Error("保存に失敗しました");
    }
  };

  /** ページ確認 */
  const handlePageConfirm = async (pageId: string) => {
    const res = await fetch("/api/ocr/pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, isConfirmed: true }),
    });
    if (!res.ok) {
      throw new Error("確認に失敗しました");
    }
  };

  /** ダブルチェック: ページ確認（isDoubleChecked を更新） */
  const handleDoubleCheckPageConfirm = async (pageId: string) => {
    const res = await fetch("/api/ocr/pages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageId, isDoubleChecked: true }),
    });
    if (!res.ok) {
      throw new Error("ダブルチェック確認に失敗しました");
    }
  };

  /** 1stチェック完了（B型2人以上パターン） */
  const handleFirstCheckComplete = async () => {
    if (!session?.user) return;
    setFirstCheckCompleting(true);
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doubleCheckStatus: "pending",
          firstCheckById: effectiveUserId,
          firstCheckByName: effectiveUserName,
        }),
      });
      if (res.ok) {
        router.push("/");
        return;
      }
      await fetchFolder();
    } catch (err) {
      alert(err instanceof Error ? err.message : "1stチェック完了に失敗しました");
    } finally {
      setFirstCheckCompleting(false);
    }
  };

  /** ダブルチェック完了 + 引き継ぎ（B型2人以上パターン） */
  const handleDoubleCheckComplete = async () => {
    if (!session?.user) return;
    setDoubleCheckCompleting(true);
    try {
      await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doubleCheckStatus: "completed",
          doubleCheckById: effectiveUserId,
          doubleCheckByName: effectiveUserName,
          handoffStatus: "handed_off",
          handoffBy: effectiveUserName,
        }),
      });
      router.push("/");
    } catch (err) {
      alert(err instanceof Error ? err.message : "ダブルチェック完了に失敗しました");
    } finally {
      setDoubleCheckCompleting(false);
    }
  };

  /** A型: needsDoubleCheck 完了 */
  const handleATypeDoubleCheckDone = async () => {
    setUpdatingNeedsDoubleCheck(true);
    try {
      await fetch(`/api/folders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needsDoubleCheck: false }),
      });
      router.push(`/folders/${id}/classify`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setUpdatingNeedsDoubleCheck(false);
    }
  };

  /** 全ページ確認完了時: ステータスを ocr_confirmed に更新 */
  const handleAllPagesConfirmed = useCallback(async (docId: string) => {
    setFullyConfirmedDocIds((prev) => new Set(prev).add(docId));

    // ドキュメントのステータスを ocr_confirmed に更新
    try {
      await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ocr_confirmed" }),
      });
      setFolder((prev) =>
        prev
          ? {
              ...prev,
              documents: prev.documents.map((d) =>
                d.id === docId ? { ...d, status: "ocr_confirmed" } : d
              ),
            }
          : null
      );
    } catch (error) {
      console.error("Failed to update document status:", error);
    }
  }, []);

  // A型: 引き継ぎフォルダは自動的に仕訳分類ページへ遷移
  // ただし needsDoubleCheck の場合はリダイレクトしない
  const autoClassifyRedirected = useRef(false);
  useEffect(() => {
    if (!folder || !canViewJournal) return;
    if (folder.handoffStatus !== "handed_off") return;
    if (folder.needsDoubleCheck) return; // ダブルチェック必要時はブロック
    // ocr_confirmed（未分類）or classified（確認待ち）がある場合にリダイレクト
    const hasWorkToDo = folder.documents.some(
      d => d.status === "ocr_confirmed" || d.status === "classified"
    );
    if (!hasWorkToDo) return;
    if (autoClassifyRedirected.current) return;

    autoClassifyRedirected.current = true;
    router.push(`/folders/${id}/classify`);
  }, [folder, canViewJournal, router, id]);

  // ocrDocsData の変更を監視して、全ページ確認済みのドキュメントを自動検出
  useEffect(() => {
    Object.entries(ocrDocsData).forEach(([docId, doc]) => {
      if (
        doc.pages.length > 0 &&
        doc.pages.every((p) => p.isConfirmed) &&
        !confirmedProcessedRef.current.has(docId)
      ) {
        confirmedProcessedRef.current.add(docId);
        handleAllPagesConfirmed(docId);
      }
    });
  }, [ocrDocsData, handleAllPagesConfirmed]);

  const getNextAction = (status: string, docId: string) => {
    switch (status) {
      case "uploaded":
        return { href: null, label: "OCR処理開始", action: () => handleManualOCR(docId) };
      case "ocr_processing":
        return { href: null, label: "処理中..." };
      case "ocr_complete":
        return { href: null, label: "" };
      case "ocr_confirmed":
        return { href: null, label: "" };
      case "classified":
        return canViewJournal ? { href: `/folders/${id}/classify`, label: "仕訳確認" } : { href: null, label: "" };
      case "reviewed":
        return { href: null, label: "" };
      case "exported":
        return { href: null, label: "" };
      default:
        return { href: null, label: "" };
    }
  };

  const handleFolderExport = async (format: "generic" | "yayoi" | "freee") => {
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: id, format }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "エクスポートに失敗しました");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `journal_entries_${format}.csv`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      setShowFormatPicker(false);
      await fetchFolder();
    } catch (err) {
      alert(err instanceof Error ? err.message : "エクスポートに失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const isAnyProcessing = ocrProcessingIds.size > 0;
  const processedCount = folder
    ? folder.documents.filter(
        (d) => d.status !== "uploaded" && d.status !== "ocr_processing"
      ).length
    : 0;
  const totalCount = folder?.documents.length || 0;

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
        {fetchError && (
          <p className="text-red-500 text-xs mt-2 max-w-lg mx-auto break-all bg-red-50 p-3 rounded-lg">
            {fetchError}
          </p>
        )}
        <Link href="/" className="text-teal-600 hover:underline mt-4 inline-block">
          ダッシュボードに戻る
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-teal-700 hover:text-teal-900"
        >
          <ArrowLeft className="w-4 h-4" />
          ダッシュボード
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <h1 className="text-lg md:text-xl font-black text-foreground truncate">{folder.name}</h1>
          <span className="text-xs md:text-sm text-teal-700 flex-shrink-0">
            {folder.documents.length} ファイル
          </span>
        </div>
      </div>

      {/* B型: 引き継ぎ済バッジ or 引き継ぎボタン */}
      {userRole === "user_b" && folder.handoffStatus === "handed_off" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 bg-cyan-50 border border-cyan-200 rounded-lg px-4 py-3">
            <Send className="h-5 w-5 text-cyan-600 flex-shrink-0" />
            <span className="text-sm text-cyan-800">
              このフォルダはA型利用者に引き継ぎ済みです
              {folder.handoffAt && (
                <span className="text-xs text-cyan-600 ml-2">
                  ({new Date(folder.handoffAt).toLocaleString("ja-JP")})
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              ダッシュボードに戻る
            </Link>
            <span className="bg-teal-600 text-white text-sm rounded-full px-3 py-1.5 shadow-lg animate-bounce">
              ← こちらからトップに戻りましょう
            </span>
          </div>
        </div>
      )}
      {/* B型: ダブルチェック待ち（自分が1stチェック者の場合） */}
      {userRole === "user_b" &&
        folder.doubleCheckStatus === "pending" &&
        effectiveUserId === folder.firstCheckById && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <span className="text-sm text-amber-800">
              別の利用者がダブルチェックを行います。完了までお待ちください。
            </span>
          </div>
        )}

      {/* B型: ダブルチェック完了 → 引き継ぎ可能 */}
      {userRole === "user_b" &&
        !folder.handoffStatus &&
        folder.doubleCheckStatus === "completed" && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-800">
              ダブルチェックが完了しました。引き継ぎを行ってください。
            </span>
          </div>
        )}

      {/* B型: 引き継ぎ可能バナー（ダブルチェック不要 or 完了） */}
      {userRole === "user_b" &&
        !folder.handoffStatus &&
        !folder.doubleCheckStatus &&
        folder.documents.length > 0 &&
        folder.documents.every(
          (d) =>
            d.status === "ocr_confirmed" ||
            d.status === "classified" ||
            d.status === "reviewed" ||
            d.status === "exported"
        ) && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-800">
              全ドキュメントのOCR確認が完了しました。
            </span>
          </div>
        )}

      {/* A型: needsDoubleCheck バナー */}
      {canViewJournal &&
        folder.handoffStatus === "handed_off" &&
        folder.needsDoubleCheck && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <span className="text-sm text-amber-800">
              B型利用者が1人のため、ダブルチェックが必要です。各ドキュメントの内容を再確認してください。
            </span>
          </div>
        )}

      {/* 不一致アラート（A型表示時: ダブルチェック完了後） */}
      {canViewJournal &&
        folder.handoffStatus === "handed_off" &&
        folder.doubleCheckStatus === "completed" && (
          <MismatchAlert folderId={id} onResolve={() => fetchFolder()} />
        )}

      {/* フォルダ詳細情報カード */}
      {(() => {
        // 仕訳データの集計
        const allJournalEntries = folder.documents.flatMap((d) => d.journalEntries || []);
        const totalAmount = allJournalEntries.reduce((sum, e) => sum + (e.debitAmount || 0), 0);
        const totalTax = Math.floor(totalAmount - totalAmount / 1.1); // 概算消費税
        const confirmedEntryCount = allJournalEntries.filter((e) => e.isConfirmed).length;

        // ステータス判定
        const statuses = folder.documents.map((d) => d.status);
        const overallStatus = statuses.every((s) => s === "exported")
          ? "エクスポート済"
          : statuses.every((s) => s === "reviewed" || s === "exported")
            ? "確認済"
            : statuses.some((s) => s === "classified" || s === "reviewed" || s === "exported")
              ? "仕訳済"
              : statuses.some((s) => s === "ocr_confirmed")
                ? "OCR確認完了"
                : statuses.some((s) => s === "ocr_complete")
                  ? "OCR完了"
                  : "処理中";

        return (
          <div className="card-glass rounded-xl overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-teal-100/50">
              {/* 左列 */}
              <div className="divide-y divide-teal-100/50">
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-teal-700 flex-shrink-0">フォルダ名</dt>
                  <dd className="text-sm text-foreground">{folder.name}</dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-teal-700 flex-shrink-0">作成日時</dt>
                  <dd className="text-sm text-foreground">
                    {new Date(folder.createdAt).toLocaleString("ja-JP")}
                  </dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-teal-700 flex-shrink-0">得意先</dt>
                  <dd className="text-sm text-foreground">{folder.client?.name || "-"}</dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-teal-700 flex-shrink-0">ステータス</dt>
                  <dd className="text-sm">
                    <span className={cn(
                      "inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium",
                      overallStatus === "エクスポート済" ? "bg-emerald-100 text-emerald-800" :
                      overallStatus === "確認済" ? "bg-green-100 text-green-800" :
                      overallStatus === "仕訳済" ? "bg-purple-100 text-purple-800" :
                      "bg-teal-100 text-teal-800"
                    )}>
                      {overallStatus}
                    </span>
                  </dd>
                </div>
              </div>
              {/* 右列 */}
              <div className="divide-y divide-teal-100/50">
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-teal-700 flex-shrink-0">ファイル数</dt>
                  <dd className="text-sm text-foreground">{folder.documents.length} 件</dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-teal-700 flex-shrink-0">明細数</dt>
                  <dd className="text-sm text-foreground">{allJournalEntries.length} 件</dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-teal-700 flex-shrink-0">合計金額</dt>
                  <dd className="text-sm">
                    {allJournalEntries.length > 0 ? (
                      <>
                        <span className="font-medium text-teal-700 text-base">
                          {formatCurrency(totalAmount)}
                        </span>
                        <span className="text-teal-600 text-xs ml-1">
                          (内消費税: {formatCurrency(totalTax)})
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-teal-700 flex-shrink-0">確認状況</dt>
                  <dd className="text-sm text-foreground">
                    {allJournalEntries.length > 0 ? (
                      <span>
                        {confirmedEntryCount}/{allJournalEntries.length} 件確認済
                        {confirmedEntryCount === allJournalEntries.length && allJournalEntries.length > 0 && (
                          <Check className="inline w-4 h-4 text-green-600 ml-1" />
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </dd>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* OCR処理中バナー */}
      {isAnyProcessing && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-teal-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-teal-900">
              OCR処理中... ({processedCount}/{totalCount} 完了)
            </p>
            <p className="text-xs text-teal-700 mt-0.5">
              処理が完了するまでこのページでお待ちください
            </p>
          </div>
        </div>
      )}

      {/* OCRエラー表示 */}
      {Object.keys(ocrErrors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm font-medium text-red-900 mb-2">OCR処理でエラーが発生しました</p>
          {Object.entries(ocrErrors).map(([docId, error]) => {
            const doc = folder.documents.find((d) => d.id === docId);
            return (
              <div key={docId} className="flex items-center justify-between text-xs text-red-700 py-1">
                <span>{doc?.filename || docId}: {error}</span>
                <button
                  onClick={() => handleManualOCR(docId)}
                  className="text-red-600 hover:text-red-800 font-medium ml-2"
                >
                  再試行
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ドキュメント一覧 */}
      {folder.documents.length === 0 ? (
        <div className="text-center py-16 card-glass rounded-xl">
          <FileText className="mx-auto h-16 w-16 text-teal-300 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            ドキュメントがありません
          </h3>
        </div>
      ) : (
        <>
          {/* デスクトップ: テーブル表示 */}
          <div className="hidden md:block card-glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-teal-50/80 border-b">
                    <th className="px-4 py-3 text-left font-medium text-teal-800">作成日</th>
                    <th className="px-4 py-3 text-left font-medium text-teal-800">ファイル名</th>
                    <th className="px-4 py-3 text-left font-medium text-teal-800">ステータス</th>
                    <th className="px-4 py-3 text-center font-medium text-teal-800">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {folder.documents.map((doc) => {
                    const nextAction = getNextAction(doc.status, doc.id);
                    const isProcessing = ocrProcessingIds.has(doc.id);
                    return (
                      <tr key={doc.id} className="border-b hover:bg-teal-50/50">
                        <td className="px-4 py-4 text-teal-700 whitespace-nowrap">
                          {new Date(doc.createdAt).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <span className="text-foreground truncate max-w-[250px]">{doc.filename}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" />}
                            <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-medium", STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-800")}>
                              {isProcessing ? "OCR処理中..." : STATUS_LABELS[doc.status] || doc.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-2">
                            {nextAction.label === "" ? null : nextAction.href ? (
                              <Link href={nextAction.href} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                                <ArrowRight className="w-4 h-4" />{nextAction.label}
                              </Link>
                            ) : nextAction.action ? (
                              <button onClick={nextAction.action} disabled={isProcessing} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-teal-600 hover:bg-teal-50 rounded-lg transition-colors disabled:opacity-50">
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                                {nextAction.label}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-400">
                                <Loader2 className="w-4 h-4 animate-spin" />{nextAction.label}
                              </span>
                            )}
                            <button onClick={() => handleDeleteDocument(doc.id)} disabled={deletingId === doc.id || isProcessing} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                              {deletingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
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
            {folder.documents.map((doc) => {
              const nextAction = getNextAction(doc.status, doc.id);
              const isProcessing = ocrProcessingIds.has(doc.id);
              return (
                <div key={doc.id} className="card-glass rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate">{doc.filename}</span>
                      </div>
                      <p className="text-xs text-teal-700">{new Date(doc.createdAt).toLocaleDateString("ja-JP")}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500" />}
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium", STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-800")}>
                        {isProcessing ? "OCR処理中..." : STATUS_LABELS[doc.status] || doc.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t">
                    {nextAction.label !== "" && (
                      nextAction.href ? (
                        <Link href={nextAction.href} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-600 hover:bg-teal-50 rounded-lg transition-colors">
                          <ArrowRight className="w-3.5 h-3.5" />{nextAction.label}
                        </Link>
                      ) : nextAction.action ? (
                        <button onClick={nextAction.action} disabled={isProcessing} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-600 hover:bg-teal-50 rounded-lg transition-colors disabled:opacity-50">
                          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                          {nextAction.label}
                        </button>
                      ) : null
                    )}
                    <button onClick={() => handleDeleteDocument(doc.id)} disabled={deletingId === doc.id || isProcessing} className="ml-auto inline-flex items-center gap-1 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                      {deletingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      削除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ステップガイド: OCR確認が必要 */}
      {folder.documents.some(d => d.status === "ocr_complete") && (
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-1.5 bg-teal-600 text-white text-sm rounded-full px-4 py-2 shadow-lg animate-bounce">
            ↓ 下にスクロールしてOCR内容を確認してください
          </span>
        </div>
      )}

      {/* 仕訳明細セクション (Money Forward風) - B型は非表示 */}
      {canViewJournal && (() => {
        const classifiedDocs = folder.documents.filter(
          (d) =>
            (d.status === "classified" || d.status === "reviewed" || d.status === "exported") &&
            d.journalEntries &&
            d.journalEntries.length > 0
        );
        if (classifiedDocs.length === 0) return null;

        // 全ドキュメントの仕訳エントリをフラットにまとめる
        const allEntries = classifiedDocs.flatMap((doc) =>
          doc.journalEntries.map((entry) => ({
            ...entry,
            documentId: doc.id,
            filename: doc.filename,
            filepath: doc.filepath,
            fileType: doc.fileType || (doc.filename.endsWith(".pdf") ? "pdf" : "image"),
            pages: doc.pages,
          }))
        );

        // 日付順でソート
        allEntries.sort((a, b) => a.date.localeCompare(b.date));

        const confirmedCount = allEntries.filter((e) => e.isConfirmed).length;

        // 重複検知: 金額 + 勘定科目が一致 & 別ファイル由来
        // 日付は両方存在して異なる場合のみ除外（片方が空なら重複の可能性あり）
        // duplicateDismissed のエントリおよび削除依頼済みのエントリは重複検知から除外
        const duplicateIds = new Set<string>();
        const duplicatePairs = new Map<string, string[]>();
        for (let i = 0; i < allEntries.length; i++) {
          for (let j = i + 1; j < allEntries.length; j++) {
            const a = allEntries[i];
            const b = allEntries[j];
            if (a.duplicateDismissed || b.duplicateDismissed) continue;
            if (pendingDeletionEntryIds.has(a.id) || pendingDeletionEntryIds.has(b.id)) continue;
            const datesContradict = a.date && b.date && a.date !== b.date;
            if (
              a.documentId !== b.documentId &&
              !datesContradict &&
              a.accountCode && b.accountCode && a.accountCode === b.accountCode &&
              (a.debitAmount > 0 || a.creditAmount > 0) &&
              a.debitAmount === b.debitAmount &&
              a.creditAmount === b.creditAmount
            ) {
              duplicateIds.add(a.id);
              duplicateIds.add(b.id);
              duplicatePairs.set(a.id, [...(duplicatePairs.get(a.id) || []), b.id]);
              duplicatePairs.set(b.id, [...(duplicatePairs.get(b.id) || []), a.id]);
            }
          }
        }

        // 削除依頼エントリの重複ペアを別途検索（指導員の比較モーダル用）
        const pendingDeletionPairs = new Map<string, string>();
        for (const entry of allEntries) {
          if (!pendingDeletionEntryIds.has(entry.id)) continue;
          for (const other of allEntries) {
            if (other.id === entry.id) continue;
            if (other.documentId === entry.documentId) continue;
            const datesContradict = entry.date && other.date && entry.date !== other.date;
            if (
              !datesContradict &&
              entry.accountCode && other.accountCode && entry.accountCode === other.accountCode &&
              (entry.debitAmount > 0 || entry.creditAmount > 0) &&
              entry.debitAmount === other.debitAmount &&
              entry.creditAmount === other.creditAmount
            ) {
              pendingDeletionPairs.set(entry.id, other.id);
              break;
            }
          }
        }

        // 削除依頼済みのエントリ数
        const pendingDeletionCount = allEntries.filter((e) => pendingDeletionEntryIds.has(e.id)).length;

        // 指導員/管理者かどうか
        const isAdminOrInstructor = userRole === "admin" || userRole === "instructor";

        // アラート判定
        const getAlerts = (entry: typeof allEntries[0]): string[] => {
          const alerts: string[] = [];
          if (!entry.date) alerts.push("日付");
          if (!entry.description) alerts.push("摘要");
          if (entry.debitAmount <= 0 && entry.creditAmount <= 0) alerts.push("金額");
          if (!entry.accountCode && !entry.accountName) alerts.push("勘定科目");
          if (!entry.taxRate) alerts.push("税区分");
          // 指導員には重複アラートを表示しない（削除依頼で対応するため）
          if (!isAdminOrInstructor && duplicateIds.has(entry.id)) alerts.push("重複の可能性");
          if (pendingDeletionEntryIds.has(entry.id)) alerts.push("削除依頼中");
          return alerts;
        };
        const alertCount = allEntries.filter((e) => getAlerts(e).length > 0).length;
        const missingFieldCount = allEntries.filter((e) => {
          const a = getAlerts(e);
          return a.some((msg) => msg !== "重複の可能性" && msg !== "削除依頼中");
        }).length;
        const duplicateCount = duplicateIds.size;

        // アラート状態を更新（エクスポートボタン制御用）
        const currentHasAlerts = alertCount > 0;
        if (currentHasAlerts !== hasUnresolvedAlerts) {
          // 次のレンダーサイクルで更新（レンダー中のsetState回避）
          setTimeout(() => setHasUnresolvedAlerts(currentHasAlerts), 0);
        }

        return (
          <section className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-base md:text-lg font-bold text-foreground">
                仕訳明細
                <span className="ml-2 text-sm font-normal text-teal-700">
                  {allEntries.length} 件
                  {confirmedCount > 0 && (
                    <span className="text-green-600 ml-1">
                      ({confirmedCount} 件確認済)
                    </span>
                  )}
                </span>
              </h2>
              <Link
                href={`/folders/${id}/classify`}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-600 hover:bg-teal-50 rounded-lg transition-colors self-start"
              >
                <Pencil className="w-4 h-4" />
                仕訳確認・編集
              </Link>
            </div>


            {/* アラートバナー */}
            {(missingFieldCount > 0 || duplicateCount > 0 || pendingDeletionCount > 0) && (
              <div className="space-y-2">
                {missingFieldCount > 0 && (
                  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                    <span className="text-sm text-amber-800">
                      <strong>{missingFieldCount} 件</strong>の仕訳に入力不足があります。詳細ボタンから修正してください。
                    </span>
                  </div>
                )}
                {!isAdminOrInstructor && duplicateCount > 0 && (
                  <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                    <CircleAlert className="h-5 w-5 text-orange-600 flex-shrink-0 animate-alert-bounce" />
                    <span className="text-sm text-orange-800">
                      <strong>{duplicateCount} 件</strong>の仕訳に重複の可能性があります（日付・金額・勘定科目が一致、別ファイル由来）。不要な場合は詳細から削除してください。
                    </span>
                  </div>
                )}
                {pendingDeletionCount > 0 && (
                  (userRole === "admin" || userRole === "instructor") ? (
                  <div className="flex items-center justify-between gap-3 bg-red-50 border-2 border-red-300 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 animate-alert-bounce" />
                      <div className="text-sm">
                        <span className="text-red-800 font-bold">{pendingDeletionCount} 件の削除依頼があなたの承認を待っています</span>
                        <span className="text-red-700 ml-1">— 下の表で「要承認」をクリックして承認・却下してください。</span>
                      </div>
                    </div>
                  </div>
                  ) : (
                  <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
                    <Clock className="h-5 w-5 text-purple-500 flex-shrink-0" />
                    <div className="text-sm">
                      <span className="text-purple-800 font-medium">指導員の承認待ちです</span>
                      <span className="text-purple-700 ml-1">— {pendingDeletionCount} 件の削除依頼が承認されると、次のステップ（エクスポート）に進めます。</span>
                    </div>
                  </div>
                  )
                )}
              </div>
            )}

            {/* デスクトップ: テーブル表示 */}
            <div className="hidden md:block card-glass rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-teal-50/80 border-b">
                      <th className="px-4 py-3 text-left font-medium text-teal-800 whitespace-nowrap">日付</th>
                      <th className="px-4 py-3 text-center font-medium text-teal-800 whitespace-nowrap">アラート</th>
                      <th className="px-4 py-3 text-left font-medium text-teal-800 whitespace-nowrap">支払先・内容</th>
                      <th className="px-4 py-3 text-right font-medium text-teal-800 whitespace-nowrap">金額（税込）</th>
                      <th className="px-4 py-3 text-left font-medium text-teal-800 whitespace-nowrap">勘定科目</th>
                      <th className="px-4 py-3 text-left font-medium text-teal-800 whitespace-nowrap">税区分</th>
                      <th className="px-4 py-3 text-center font-medium text-teal-800 whitespace-nowrap">確認</th>
                      <th className="px-4 py-3 text-left font-medium text-teal-800 whitespace-nowrap">ファイル</th>
                      <th className="px-4 py-3 text-center font-medium text-teal-800 whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // ステップガイド: 最初の要対応エントリを特定
                      const firstActionEntryId = allEntries.find((e) => {
                        const a = getAlerts(e);
                        return a.length > 0 || !e.isConfirmed;
                      })?.id ?? null;
                      let actionIndex = 0;
                      const totalActions = allEntries.filter((e) => {
                        const a = getAlerts(e);
                        return a.length > 0 || !e.isConfirmed;
                      }).length;

                      return allEntries.map((entry) => {
                      const alerts = getAlerts(entry);
                      const isDuplicate = !isAdminOrInstructor && duplicateIds.has(entry.id);
                      const isPendingDeletion = pendingDeletionEntryIds.has(entry.id);
                      const missingAlerts = alerts.filter((a) => a !== "重複の可能性" && a !== "削除依頼中");
                      const hasIssue = alerts.length > 0 || !entry.isConfirmed;
                      const isFirstAction = entry.id === firstActionEntryId;
                      if (hasIssue) actionIndex++;

                      // アラート種別の判定（1つのバッジにまとめる）
                      const alertDetails: { label: string; color: string }[] = [];
                      if (isPendingDeletion) alertDetails.push({ label: "削除依頼の承認待ちです", color: "teal" });
                      if (isDuplicate) alertDetails.push({ label: "重複の可能性があります", color: "orange" });
                      if (missingAlerts.length > 0) alertDetails.push(...missingAlerts.map((a) => ({ label: `${a}が未入力`, color: "amber" })));
                      if (!entry.isConfirmed && alerts.length === 0 && !isPendingDeletion) alertDetails.push({ label: "仕訳が未確認です", color: "blue" });

                      // バッジの色（最も重要なアラートの色）
                      const badgeColor = isPendingDeletion ? "teal" : isDuplicate ? "orange" : missingAlerts.length > 0 ? "amber" : !entry.isConfirmed ? "blue" : "";

                      return (
                      <tr
                        key={entry.id}
                        className={cn(
                          "border-b hover:bg-teal-50/50 transition-colors",
                          isPendingDeletion && (userRole === "admin" || userRole === "instructor") ? "bg-red-50/60" :
                          isPendingDeletion ? "bg-teal-50/40 opacity-60" : "",
                          !isPendingDeletion && isDuplicate ? "bg-orange-50/40" : "",
                          !isPendingDeletion && !isDuplicate && missingAlerts.length > 0 ? "bg-amber-50/40" : "",
                          !isPendingDeletion && !isDuplicate && alerts.length === 0 && entry.isConfirmed ? "bg-green-50/30" : "",
                          !isPendingDeletion && !isDuplicate && alerts.length === 0 && entry.aiSuggested && !entry.isConfirmed ? "bg-yellow-50/30" : ""
                        )}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{entry.date || <span className="text-red-400">-</span>}</td>
                        <td className="px-4 py-3 text-center">
                          {hasIssue ? (
                            <div className="relative group">
                              <button
                                type="button"
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
                                  isPendingDeletion && (userRole === "admin" || userRole === "instructor") ? "bg-red-100 hover:bg-red-200 text-red-700 cursor-pointer ring-2 ring-red-300 animate-pulse" :
                                  isPendingDeletion ? "bg-teal-100 text-teal-700 cursor-default" :
                                  badgeColor === "orange" ? "bg-orange-100 hover:bg-orange-200 text-orange-700 cursor-pointer" :
                                  badgeColor === "amber" ? "bg-amber-100 hover:bg-amber-200 text-amber-700 cursor-pointer" :
                                  "bg-teal-50 hover:bg-teal-100 text-teal-600 cursor-pointer"
                                )}
                                onClick={() => {
                                  if (isPendingDeletion && userRole !== "admin" && userRole !== "instructor") return;
                                  if (isPendingDeletion) {
                                    // 重複ペアがあれば比較モーダルで表示
                                    const pairedId = pendingDeletionPairs.get(entry.id);
                                    const paired = pairedId ? allEntries.find(e => e.id === pairedId) : null;
                                    if (paired) { setImageZoom({}); setDuplicateCompare({ entry, paired }); }
                                    else { openDetail(entry); }
                                    return;
                                  }
                                  if (isDuplicate) {
                                    const pairedIds = duplicatePairs.get(entry.id) || [];
                                    const paired = allEntries.find(e => pairedIds.includes(e.id));
                                    if (paired) { setImageZoom({}); setDuplicateCompare({ entry, paired }); }
                                  } else {
                                    openDetail(entry);
                                  }
                                }}
                              >
                                {isPendingDeletion ? (
                                  (userRole === "admin" || userRole === "instructor") ? (
                                    <AlertTriangle className="w-4 h-4 text-red-600" />
                                  ) : (
                                    <Clock className="w-4 h-4 text-teal-600" />
                                  )
                                ) : (
                                <CircleAlert className={cn(
                                  "w-4 h-4",
                                  badgeColor === "orange" ? "text-orange-600" :
                                  badgeColor === "amber" ? "text-amber-600 animate-alert-bounce" :
                                  "text-teal-500"
                                )} />
                                )}
                                <span>{isPendingDeletion && (userRole === "admin" || userRole === "instructor") ? "要承認" : isPendingDeletion ? "削除待ち" : isDuplicate ? "重複？" : missingAlerts.length > 0 ? "要確認" : "未確認"}</span>
                              </button>
                              {/* ホバー詳細 */}
                              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 pointer-events-none">
                                <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2.5 whitespace-nowrap shadow-lg">
                                  {alertDetails.map((d, i) => (
                                    <p key={i} className="text-gray-200 leading-5 flex items-center gap-1">
                                      <span className={cn(
                                        "w-1.5 h-1.5 rounded-full shrink-0",
                                        d.color === "orange" ? "bg-orange-400" :
                                        d.color === "amber" ? "bg-amber-400" : "bg-teal-400"
                                      )} />
                                      {d.label}
                                    </p>
                                  ))}
                                  {!isPendingDeletion && <p className="text-gray-400 text-[10px] mt-1 border-t border-gray-700 pt-1">クリックして確認</p>}
                                </div>
                                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-800" />
                              </div>
                              {/* ステップガイド吹き出し */}
                              {isFirstAction && (
                                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-teal-600 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg z-10 animate-bounce">
                                  アラートを確認してください（残り{totalActions}件）
                                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-teal-600" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 text-green-500">
                              <Check className="w-4 h-4" />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[280px]">
                          <div className="truncate text-foreground">{entry.description}</div>
                          {entry.subAccountName && <div className="text-xs text-teal-700 truncate">{entry.subAccountName}</div>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap text-foreground">
                          {entry.debitAmount > 0 ? formatCurrency(entry.debitAmount) : entry.creditAmount > 0 ? formatCurrency(entry.creditAmount) : "-"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {entry.accountName}
                          {entry.aiSuggested && !entry.isConfirmed && <span className="ml-1 text-xs text-yellow-600 bg-yellow-100 px-1 rounded">AI</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-teal-700 text-xs">{entry.taxRate || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          {entry.isConfirmed ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 text-green-600 rounded-full"><Check className="w-3.5 h-3.5" /></span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-gray-100 text-gray-400 rounded-full"><span className="w-2 h-2 bg-gray-300 rounded-full" /></span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-xs text-gray-500 truncate max-w-[120px] block">{entry.filename}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => openDetail(entry)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-600 hover:bg-teal-50 rounded-lg transition-colors border border-teal-200">
                            詳細
                          </button>
                        </td>
                      </tr>
                    );
                    });
                    })()}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-teal-50/80 border-t flex items-center justify-between">
                <div className="text-sm text-teal-700">
                  合計金額: <span className="font-medium text-foreground">{formatCurrency(allEntries.reduce((sum, e) => sum + (e.debitAmount || e.creditAmount || 0), 0))}</span>
                </div>
                <Link href={`/folders/${id}/classify`} className="text-sm text-teal-600 hover:underline">仕訳確認ページへ →</Link>
              </div>
            </div>

            {/* モバイル: カード表示 */}
            <div className="md:hidden space-y-3">
              {allEntries.map((entry) => {
                const alerts = getAlerts(entry);
                const isDuplicate = !isAdminOrInstructor && duplicateIds.has(entry.id);
                const isPendingDeletion = pendingDeletionEntryIds.has(entry.id);
                const missingAlerts = alerts.filter((a) => a !== "重複の可能性" && a !== "削除依頼中");
                return (
                <div
                  key={entry.id}
                  className={cn(
                    "card-glass rounded-xl p-4 space-y-2",
                    isPendingDeletion ? "border-teal-300 bg-teal-50/40 opacity-60" : "",
                    !isPendingDeletion && isDuplicate ? "border-orange-300 bg-orange-50/40" : "",
                    !isPendingDeletion && !isDuplicate && missingAlerts.length > 0 ? "border-amber-300 bg-amber-50/40" : "",
                    !isPendingDeletion && alerts.length === 0 && entry.isConfirmed ? "border-green-200 bg-green-50/30" : "",
                    !isPendingDeletion && alerts.length === 0 && entry.aiSuggested && !entry.isConfirmed ? "border-yellow-200 bg-yellow-50/30" : ""
                  )}
                >
                  {isPendingDeletion && (
                    (userRole === "admin" || userRole === "instructor") ? (
                    <div className="space-y-1.5 w-full">
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-100 rounded-lg text-purple-700 text-xs font-medium w-full">
                        <Clock className="w-4 h-4 text-purple-600 flex-shrink-0" />
                        <span>削除依頼あり</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const reqId = pendingDeletionMap.get(entry.id);
                            if (!reqId) return;
                            setApprovingDeleteId(entry.id);
                            try {
                              const res = await fetch("/api/entries/delete-request/approve", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: reqId }),
                              });
                              if (!res.ok) throw new Error("承認に失敗しました");
                              await fetchFolder();
                              await fetchPendingDeletions();
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "承認に失敗しました");
                            } finally {
                              setApprovingDeleteId(null);
                            }
                          }}
                          disabled={approvingDeleteId === entry.id}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {approvingDeleteId === entry.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                          承認（削除）
                        </button>
                        <button
                          onClick={async () => {
                            const reqId = pendingDeletionMap.get(entry.id);
                            if (!reqId) return;
                            setApprovingDeleteId(entry.id);
                            try {
                              const res = await fetch("/api/entries/delete-request/approve", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: reqId }),
                              });
                              if (!res.ok) throw new Error("却下に失敗しました");
                              await fetchPendingDeletions();
                              await fetchFolder();
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "却下に失敗しました");
                            } finally {
                              setApprovingDeleteId(null);
                            }
                          }}
                          disabled={approvingDeleteId === entry.id}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          却下
                        </button>
                      </div>
                    </div>
                    ) : (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-teal-100 rounded-lg text-teal-700 text-xs font-medium w-full">
                      <Clock className="w-4 h-4 text-teal-600 flex-shrink-0" />
                      <span>削除依頼中（承認待ち）</span>
                    </div>
                    )
                  )}
                  {!isPendingDeletion && isDuplicate && (
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-2 py-1 bg-orange-100 hover:bg-orange-200 rounded-lg text-orange-700 text-xs font-medium w-full transition-colors"
                      onClick={() => {
                        const pairedIds = duplicatePairs.get(entry.id) || [];
                        const paired = allEntries.find(e => pairedIds.includes(e.id));
                        if (paired) { setImageZoom({}); setDuplicateCompare({ entry, paired }); }
                      }}
                    >
                      <CircleAlert className="w-4 h-4 animate-alert-bounce text-orange-600 flex-shrink-0" />
                      <span>重複の可能性（タップして比較）</span>
                    </button>
                  )}
                  {missingAlerts.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-100 rounded-lg text-amber-700 text-xs font-medium">
                      <CircleAlert className="w-4 h-4 animate-alert-bounce text-amber-600 flex-shrink-0" />
                      <span>未入力: {missingAlerts.join("、")}</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{entry.description || <span className="text-red-400">（摘要なし）</span>}</p>
                      {entry.subAccountName && <p className="text-xs text-teal-700 truncate">{entry.subAccountName}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-mono font-medium text-foreground">
                        {entry.debitAmount > 0 ? formatCurrency(entry.debitAmount) : entry.creditAmount > 0 ? formatCurrency(entry.creditAmount) : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                    <span>{entry.date}</span>
                    <span className="text-gray-300">|</span>
                    <span>{entry.accountName}</span>
                    {entry.aiSuggested && !entry.isConfirmed && <span className="text-yellow-600 bg-yellow-100 px-1 rounded">AI</span>}
                    {entry.taxRate && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span>{entry.taxRate}</span>
                      </>
                    )}
                    {entry.isConfirmed && (
                      <span className="inline-flex items-center gap-0.5 text-green-600">
                        <Check className="w-3 h-3" />確認済
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-[10px] text-gray-400 truncate max-w-[150px]">{entry.filename}</span>
                    <button
                      onClick={() => openDetail(entry)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-600 hover:bg-teal-50 rounded-lg transition-colors border border-teal-200"
                    >
                      詳細
                    </button>
                  </div>
                </div>
              );
              })}
              <div className="card-glass rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="text-sm text-teal-700">
                  合計: <span className="font-medium text-foreground">{formatCurrency(allEntries.reduce((sum, e) => sum + (e.debitAmount || e.creditAmount || 0), 0))}</span>
                </div>
                <Link href={`/folders/${id}/classify`} className="text-xs text-teal-600 hover:underline">仕訳確認 →</Link>
              </div>
            </div>
          </section>
        );
      })()}

      {/* OCR内容確認セクション */}
      {(() => {
        // ダブルチェックモード判定
        const isBTypeDoubleChecker =
          userRole === "user_b" &&
          folder.doubleCheckStatus === "pending" &&
          effectiveUserId !== folder.firstCheckById;
        const isATypeDoubleChecker =
          canViewJournal &&
          folder.handoffStatus === "handed_off" &&
          folder.needsDoubleCheck;
        const isDoubleCheckMode = isBTypeDoubleChecker || isATypeDoubleChecker;
        // 同一人物ブロック（B型で1stチェック者が自分の場合はreadOnly）
        const isSamePersonBlock =
          userRole === "user_b" &&
          folder.doubleCheckStatus === "pending" &&
          effectiveUserId === folder.firstCheckById;

        // OCRデータがあるドキュメント（ocr_complete + ocr_confirmed）
        const ocrVisibleDocs = folder.documents.filter((d) => ocrDocsData[d.id]);
        if (ocrVisibleDocs.length === 0) return null;

        const unconfirmedCount = ocrVisibleDocs.filter((d) => !fullyConfirmedDocIds.has(d.id)).length;
        const allOcrConfirmed = unconfirmedCount === 0;
        // 仕訳分類対象 = ocr_confirmed のドキュメント（classified以降は除外）
        const hasClassifyTarget = folder.documents.some(
          (d) => d.status === "ocr_confirmed"
        );

        // ダブルチェックモード: 全ページの isDoubleChecked を確認
        const allPagesDoubleChecked = isDoubleCheckMode && ocrVisibleDocs.every((doc) => {
          const fullDoc = ocrDocsData[doc.id];
          return fullDoc && fullDoc.pages.length > 0 && fullDoc.pages.every((p) => p.isDoubleChecked);
        });

        return (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">
                {isDoubleCheckMode ? "ダブルチェック" : "OCR内容確認"}
                {!isDoubleCheckMode && unconfirmedCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-teal-700">
                    ({unconfirmedCount} 件未確認)
                  </span>
                )}
              </h2>
              {/* 通常モード: 一括仕訳分類ボタン */}
              {!isDoubleCheckMode && canViewJournal && allOcrConfirmed && hasClassifyTarget && (
                <div className="relative">
                  <button
                    onClick={() => router.push(`/folders/${id}/classify`)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    一括仕訳分類
                  </button>
                  <div className="absolute top-full mt-1 right-0">
                    <span className="bg-teal-600 text-white text-sm rounded-full px-3 py-1.5 shadow-lg animate-bounce whitespace-nowrap inline-block">
                      ↑ 次はこちら
                    </span>
                  </div>
                </div>
              )}
            </div>

            {!isDoubleCheckMode && canViewJournal && !allOcrConfirmed && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800">
                  すべてのドキュメントのOCR確認が完了すると「一括仕訳分類」ボタンが表示されます。
                </p>
              </div>
            )}

            {ocrVisibleDocs.map((doc) => {
              const fullDoc = ocrDocsData[doc.id];
              if (!fullDoc) return null;
              const isConfirmed = fullyConfirmedDocIds.has(doc.id);
              return (
                <div key={doc.id} className="card-glass rounded-xl overflow-hidden">
                  <div className="bg-teal-50/80 px-4 py-3 border-b flex items-center gap-2">
                    <FileText className="w-4 h-4 text-red-500" />
                    <h3 className="text-sm font-medium text-teal-800">{doc.filename}</h3>
                    {isConfirmed && !isDoubleCheckMode && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                        確認完了
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    {fullDoc.pages.length > 0 ? (
                      <OCREditor
                        pages={fullDoc.pages}
                        documentFileType={fullDoc.fileType}
                        documentFilepath={fullDoc.filepath}
                        readOnly={isSamePersonBlock || (!isDoubleCheckMode && isConfirmed)}
                        mode={isDoubleCheckMode ? "double_check" : "first_check"}
                        onPageUpdate={handlePageUpdate}
                        onPageConfirm={isDoubleCheckMode
                          ? async (pageId) => {
                              await handleDoubleCheckPageConfirm(pageId);
                              setOcrDocsData((prev) => {
                                const docData = prev[doc.id];
                                if (!docData) return prev;
                                return {
                                  ...prev,
                                  [doc.id]: {
                                    ...docData,
                                    pages: docData.pages.map((p) =>
                                      p.id === pageId ? { ...p, isDoubleChecked: true } : p
                                    ),
                                  },
                                };
                              });
                            }
                          : async (pageId) => {
                              await handlePageConfirm(pageId);
                              setOcrDocsData((prev) => {
                                const docData = prev[doc.id];
                                if (!docData) return prev;
                                return {
                                  ...prev,
                                  [doc.id]: {
                                    ...docData,
                                    pages: docData.pages.map((p) =>
                                      p.id === pageId ? { ...p, isConfirmed: true } : p
                                    ),
                                  },
                                };
                              });
                            }
                        }
                        onAllPagesConfirmed={isDoubleCheckMode ? undefined : () => handleAllPagesConfirmed(doc.id)}
                      />
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        ページデータがありません
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* B型2人以上: 1stチェック完了ボタン */}
            {userRole === "user_b" &&
              !folder.handoffStatus &&
              !folder.doubleCheckStatus &&
              userBCount !== null && userBCount >= 2 &&
              allOcrConfirmed && (
                <div className="flex justify-center">
                  <div className="relative">
                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-teal-600 text-white text-sm rounded-full px-4 py-1.5 shadow-lg animate-bounce whitespace-nowrap z-10">
                      確認が終わったらここをクリック ↓
                      <span className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-teal-600" />
                    </span>
                    <button
                      onClick={handleFirstCheckComplete}
                      disabled={firstCheckCompleting}
                      className="inline-flex items-center gap-2 px-6 py-3 text-base font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors shadow-lg disabled:opacity-50"
                    >
                      {firstCheckCompleting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Check className="w-5 h-5" />
                      )}
                      1stチェック完了
                    </button>
                  </div>
                </div>
              )}

            {/* B型: ダブルチェック完了 → 引き継ぎ（1ステップ） */}
            {isBTypeDoubleChecker && allPagesDoubleChecked && !folder.handoffStatus &&
              folder.doubleCheckStatus !== "completed" && (
              <div className="flex justify-center">
                <div className="relative">
                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-teal-600 text-white text-sm rounded-full px-4 py-1.5 shadow-lg animate-bounce whitespace-nowrap z-10">
                    全項目チェック済み！A型さんに引き継ぎましょう ↓
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-teal-600" />
                  </span>
                  <button
                    onClick={handleDoubleCheckComplete}
                    disabled={doubleCheckCompleting}
                    className="inline-flex items-center gap-2 px-6 py-3 text-base font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors shadow-lg disabled:opacity-50"
                  >
                    {doubleCheckCompleting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                    ダブルチェック完了・引き継ぎ
                  </button>
                </div>
              </div>
            )}

            {/* B型1人: 従来の引き継ぎボタン（needsDoubleCheck を付与） */}
            {userRole === "user_b" &&
              !folder.handoffStatus &&
              !folder.doubleCheckStatus &&
              userBCount !== null && userBCount < 2 &&
              allOcrConfirmed && (
                <div className="flex justify-center">
                  <div className="relative">
                    <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-teal-600 text-white text-sm rounded-full px-4 py-1.5 shadow-lg animate-bounce whitespace-nowrap z-10">
                      A型さんに引き継ぎましょう ↓
                      <span className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-teal-600" />
                    </span>
                    <button
                      onClick={async () => {
                        setHandingOff(true);
                        try {
                          await fetch(`/api/folders/${id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              handoffStatus: "handed_off",
                              handoffBy: effectiveUserName,
                              needsDoubleCheck: true,
                              firstCheckById: effectiveUserId,
                              firstCheckByName: effectiveUserName,
                            }),
                          });
                          router.push("/");
                        } finally {
                          setHandingOff(false);
                        }
                      }}
                      disabled={handingOff}
                      className="inline-flex items-center gap-2 px-6 py-3 text-base font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors shadow-lg disabled:opacity-50"
                    >
                      {handingOff ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                      引き継ぎ完了
                    </button>
                  </div>
                </div>
              )}

            {/* A型: needsDoubleCheck → ダブルチェック完了ボタン */}
            {isATypeDoubleChecker && allPagesDoubleChecked && (
              <div className="flex justify-center">
                <div className="relative">
                  <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-teal-600 text-white text-sm rounded-full px-4 py-1.5 shadow-lg animate-bounce whitespace-nowrap z-10">
                    全項目チェック済み！ここをクリック ↓
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-teal-600" />
                  </span>
                  <button
                    onClick={handleATypeDoubleCheckDone}
                    disabled={updatingNeedsDoubleCheck}
                    className="inline-flex items-center gap-2 px-6 py-3 text-base font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors shadow-lg disabled:opacity-50"
                  >
                    {updatingNeedsDoubleCheck ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Check className="w-5 h-5" />
                    )}
                    ダブルチェック完了 → 仕訳分類へ
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* OCRデータ読み込み中 */}
      {loadingOcrDocs && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">OCRデータを読み込み中...</span>
        </div>
      )}

      {/* 重複比較モーダル */}
      {duplicateCompare && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50"
          onClick={() => !dismissingDuplicate && !deletingEntryId && setDuplicateCompare(null)}
        >
          <div
            className="bg-white md:rounded-xl shadow-2xl w-full md:max-w-4xl h-full md:h-[95vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b bg-teal-50/80 flex-shrink-0">
              <h3 className="text-base md:text-lg font-bold text-foreground flex items-center gap-2">
                <CircleAlert className="w-5 h-5 text-orange-500" />
                重複の確認
              </h3>
              <button
                onClick={() => setDuplicateCompare(null)}
                disabled={dismissingDuplicate || !!deletingEntryId}
                className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 比較コンテンツ */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200 h-full">
                {[duplicateCompare.entry, duplicateCompare.paired].map((item, idx) => (
                  <div key={item.id} className="p-4 md:p-6 flex flex-col gap-3">
                    <h4 className="text-sm font-bold text-gray-700 flex-shrink-0">仕訳 {idx === 0 ? "A" : "B"}</h4>
                    {/* 元ファイル画像プレビュー（+/-ボタンで拡大縮小、ドラッグで移動） */}
                    {(() => {
                      // PDFでもページ画像があればそちらを使う、なければiframeフォールバック
                      const matchedPage = item.pageId
                        ? item.pages.find((p) => p.id === item.pageId)
                        : item.pages[0];
                      const imgSrc = matchedPage ? `/api/files?path=${encodeURIComponent(matchedPage.imagePath)}` : "";
                      // PDFファイル自体がimagePathに入っているケースもiframeで表示
                      const pageIsPdf = matchedPage?.imagePath?.toLowerCase().endsWith(".pdf");
                      const hasPdfFallback = item.fileType === "pdf" && (!matchedPage || pageIsPdf);
                      const pdfSrc = pageIsPdf
                        ? `/api/files?path=${encodeURIComponent(matchedPage!.imagePath)}`
                        : `/api/files?path=${encodeURIComponent(item.filepath)}`;
                      const zoom = imageZoom[item.id] || { scale: 1, x: 0, y: 0 };
                      const isZoomed = zoom.scale > 1;

                      const handleZoomIn = () => {
                        setImageZoom(prev => {
                          const old = prev[item.id] || { scale: 1, x: 0, y: 0 };
                          return { ...prev, [item.id]: { ...old, scale: Math.min(5, old.scale + 0.5) } };
                        });
                      };
                      const handleZoomOut = () => {
                        setImageZoom(prev => {
                          const old = prev[item.id] || { scale: 1, x: 0, y: 0 };
                          const newScale = Math.max(1, old.scale - 0.5);
                          return { ...prev, [item.id]: { scale: newScale, x: newScale <= 1 ? 0 : old.x, y: newScale <= 1 ? 0 : old.y } };
                        });
                      };
                      const handleReset = () => {
                        setImageZoom(prev => ({ ...prev, [item.id]: { scale: 1, x: 0, y: 0 } }));
                      };

                      return (
                      <div className="border rounded-lg overflow-hidden bg-gray-50 flex flex-col flex-1 min-h-0">
                        {/* ファイル名 + ズームコントロール */}
                        <div className="px-2 py-1.5 bg-teal-50/80 border-b flex-shrink-0">
                          <p className="text-[11px] text-teal-700 truncate mb-1">{item.filename}</p>
                          {(matchedPage || hasPdfFallback) && (
                            <div className="flex items-center gap-1 bg-white/80 rounded-lg px-1.5 py-1 border border-teal-100 justify-end">
                              {/* リセット（常に左端に固定） */}
                              <button
                                type="button"
                                onClick={handleReset}
                                disabled={!isZoomed}
                                className="p-1.5 rounded-md hover:bg-teal-100 text-teal-600 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
                                title="リセット"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                              <div className="w-px h-5 bg-teal-200 mx-0.5" />
                              {/* - ボタン */}
                              <button
                                type="button"
                                onClick={handleZoomOut}
                                disabled={zoom.scale <= 1}
                                className="p-1.5 rounded-md hover:bg-teal-100 text-teal-600 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
                                title="縮小"
                              >
                                <ZoomOut className="w-4 h-4" />
                              </button>
                              {/* 倍率 */}
                              <span className="text-xs text-teal-700 font-bold w-10 text-center tabular-nums">
                                {Math.round(zoom.scale * 100)}%
                              </span>
                              {/* + ボタン */}
                              <button
                                type="button"
                                onClick={handleZoomIn}
                                disabled={zoom.scale >= 5}
                                className="p-1.5 rounded-md hover:bg-teal-100 text-teal-600 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
                                title="拡大"
                              >
                                <ZoomIn className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                        {/* 画像ビューア / PDFフォールバック */}
                        {hasPdfFallback ? (
                          <div
                            className="overflow-hidden flex-1 min-h-[200px] relative"
                          >
                            {/* 拡大時: 透明オーバーレイでドラッグ操作をキャプチャ */}
                            {isZoomed && (
                              <div
                                className="absolute inset-0 z-10 cursor-grab active:cursor-grabbing"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const startX = e.clientX;
                                  const startY = e.clientY;
                                  const startPanX = zoom.x;
                                  const startPanY = zoom.y;
                                  const onMove = (ev: MouseEvent) => {
                                    setImageZoom(prev => ({
                                      ...prev,
                                      [item.id]: { ...prev[item.id], x: startPanX + (ev.clientX - startX), y: startPanY + (ev.clientY - startY) },
                                    }));
                                  };
                                  const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                                  window.addEventListener("mousemove", onMove);
                                  window.addEventListener("mouseup", onUp);
                                }}
                              >
                                <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/50 text-white text-[10px] rounded-full px-2 py-0.5 pointer-events-none">
                                  <Hand className="w-3 h-3" />
                                  ドラッグで移動
                                </div>
                              </div>
                            )}
                            <iframe
                              src={`${pdfSrc}#toolbar=0&view=FitH`}
                              className="w-full h-full border-0 select-none"
                              style={{
                                transform: `scale(${zoom.scale}) translate(${zoom.x / zoom.scale}px, ${zoom.y / zoom.scale}px)`,
                                transformOrigin: "center center",
                                transition: "transform 0.15s ease-out",
                              }}
                              title={`PDF - ${item.filename}`}
                            />
                          </div>
                        ) : matchedPage ? (
                          <div
                            className={cn(
                              "overflow-hidden flex-1 min-h-[200px] relative",
                              isZoomed ? "cursor-grab active:cursor-grabbing" : ""
                            )}
                            onMouseDown={(e) => {
                              if (!isZoomed) return;
                              e.preventDefault();
                              const startX = e.clientX;
                              const startY = e.clientY;
                              const startPanX = zoom.x;
                              const startPanY = zoom.y;
                              const onMove = (ev: MouseEvent) => {
                                setImageZoom(prev => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    x: startPanX + (ev.clientX - startX),
                                    y: startPanY + (ev.clientY - startY),
                                  },
                                }));
                              };
                              const onUp = () => {
                                window.removeEventListener("mousemove", onMove);
                                window.removeEventListener("mouseup", onUp);
                              };
                              window.addEventListener("mousemove", onMove);
                              window.addEventListener("mouseup", onUp);
                            }}
                            onTouchStart={(e) => {
                              if (!isZoomed || e.touches.length !== 1) return;
                              const touch = e.touches[0];
                              const startX = touch.clientX;
                              const startY = touch.clientY;
                              const startPanX = zoom.x;
                              const startPanY = zoom.y;
                              const onMove = (ev: TouchEvent) => {
                                if (ev.touches.length !== 1) return;
                                const t = ev.touches[0];
                                setImageZoom(prev => ({
                                  ...prev,
                                  [item.id]: {
                                    ...prev[item.id],
                                    x: startPanX + (t.clientX - startX),
                                    y: startPanY + (t.clientY - startY),
                                  },
                                }));
                              };
                              const onEnd = () => {
                                window.removeEventListener("touchmove", onMove);
                                window.removeEventListener("touchend", onEnd);
                              };
                              window.addEventListener("touchmove", onMove, { passive: true });
                              window.addEventListener("touchend", onEnd);
                            }}
                          >
                            {isZoomed && (
                              <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-black/50 text-white text-[10px] rounded-full px-2 py-0.5 pointer-events-none">
                                <Hand className="w-3 h-3" />
                                ドラッグで移動
                              </div>
                            )}
                            <Image
                              src={imgSrc}
                              alt={`${item.filename}`}
                              width={400}
                              height={300}
                              className="w-full h-auto select-none"
                              style={{
                                transform: `scale(${zoom.scale}) translate(${zoom.x / zoom.scale}px, ${zoom.y / zoom.scale}px)`,
                                transformOrigin: "center center",
                                transition: "transform 0.15s ease-out",
                              }}
                              draggable={false}
                              unoptimized
                            />
                          </div>
                        ) : (
                          <div className="text-center py-6 text-gray-400 text-xs">画像なし</div>
                        )}
                      </div>
                      );
                    })()}
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-teal-700">日付</dt>
                        <dd className="text-foreground font-medium">{item.date || <span className="text-red-400">-</span>}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-teal-700">摘要</dt>
                        <dd className="text-foreground font-medium text-right max-w-[200px] truncate">{item.description || "-"}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-teal-700">金額</dt>
                        <dd className="text-foreground font-medium font-mono">
                          {item.debitAmount > 0 ? formatCurrency(item.debitAmount) : item.creditAmount > 0 ? formatCurrency(item.creditAmount) : "-"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-teal-700">勘定科目</dt>
                        <dd className="text-foreground font-medium">{item.accountName || "-"}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-teal-700">税区分</dt>
                        <dd className="text-foreground">{item.taxRate || "-"}</dd>
                      </div>
                    </dl>
                    {/* 削除ボタン（ロール別分岐） */}
                    {pendingDeletionEntryIds.has(item.id) ? (
                      (userRole === "admin" || userRole === "instructor") ? (
                      <div className="w-full mt-2 space-y-1.5">
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg">
                          <Clock className="w-3.5 h-3.5" />
                          削除依頼あり
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={async () => {
                              const reqId = pendingDeletionMap.get(item.id);
                              if (!reqId) return;
                              setApprovingDeleteId(item.id);
                              try {
                                const res = await fetch("/api/entries/delete-request/approve", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: reqId }),
                                });
                                if (!res.ok) throw new Error("承認に失敗しました");
                                await fetchFolder();
                                await fetchPendingDeletions();
                              } catch (err) {
                                alert(err instanceof Error ? err.message : "承認に失敗しました");
                              } finally {
                                setApprovingDeleteId(null);
                              }
                            }}
                            disabled={approvingDeleteId === item.id}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {approvingDeleteId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            承認（削除）
                          </button>
                          <button
                            onClick={async () => {
                              const reqId = pendingDeletionMap.get(item.id);
                              if (!reqId) return;
                              setApprovingDeleteId(item.id);
                              try {
                                const res = await fetch("/api/entries/delete-request/approve", {
                                  method: "DELETE",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: reqId }),
                                });
                                if (!res.ok) throw new Error("却下に失敗しました");
                                await fetchPendingDeletions();
                                await fetchFolder();
                              } catch (err) {
                                alert(err instanceof Error ? err.message : "却下に失敗しました");
                              } finally {
                                setApprovingDeleteId(null);
                              }
                            }}
                            disabled={approvingDeleteId === item.id}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            却下
                          </button>
                        </div>
                      </div>
                      ) : (
                      <div className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                        <Clock className="w-3.5 h-3.5" />
                        削除依頼済（承認待ち）
                      </div>
                      )
                    ) : (userRole === "admin" || userRole === "instructor") ? (
                      <button
                        onClick={async () => {
                          if (!confirm(`「${item.description || "この仕訳"}」を削除してもよろしいですか？\n※ このファイルの仕訳が他になければファイルも削除されます`)) return;
                          setDeletingEntryId(item.id);
                          try {
                            const res = await fetch("/api/entries", {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: item.id }),
                            });
                            if (!res.ok) throw new Error("削除に失敗しました");
                            const doc = folder?.documents.find(d => d.id === item.documentId);
                            if (doc && doc.journalEntries.filter(e => e.id !== item.id).length === 0) {
                              await fetch(`/api/documents/${item.documentId}`, { method: "DELETE" });
                            }
                            await fetchFolder();
                            setDuplicateCompare(null);
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "削除に失敗しました");
                          } finally {
                            setDeletingEntryId(null);
                          }
                        }}
                        disabled={dismissingDuplicate || !!deletingEntryId}
                        className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingEntryId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        こちらを削除
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          setRequestingDeleteId(item.id);
                          try {
                            const res = await fetch("/api/entries/delete-request", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ entryId: item.id, documentId: item.documentId, reason: "duplicate" }),
                            });
                            if (!res.ok) {
                              const data = await res.json();
                              throw new Error(data.error || "削除依頼に失敗しました");
                            }
                            setPendingDeletionEntryIds(prev => new Set([...prev, item.id]));
                            alert("削除依頼しました。指導者の承認をお待ちください。");
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "削除依頼に失敗しました");
                          } finally {
                            setRequestingDeleteId(null);
                          }
                        }}
                        disabled={dismissingDuplicate || !!deletingEntryId || requestingDeleteId === item.id}
                        className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {requestingDeleteId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        削除を依頼
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* フッターアクション */}
            <div className="border-t bg-teal-50/80 px-4 md:px-6 py-3 md:py-4 flex-shrink-0">
              <p className="text-sm text-teal-700 mb-3">この2件は重複ですか？</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={async () => {
                    setDismissingDuplicate(true);
                    try {
                      await Promise.all([
                        fetch("/api/entries", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: duplicateCompare.entry.id, duplicateDismissed: true }),
                        }),
                        fetch("/api/entries", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: duplicateCompare.paired.id, duplicateDismissed: true }),
                        }),
                      ]);
                      await fetchFolder();
                      setDuplicateCompare(null);
                    } catch (err) {
                      alert(err instanceof Error ? err.message : "更新に失敗しました");
                    } finally {
                      setDismissingDuplicate(false);
                    }
                  }}
                  disabled={dismissingDuplicate || !!deletingEntryId}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {dismissingDuplicate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  重複ではない
                </button>
                <p className="hidden sm:flex items-center text-xs text-gray-400 px-2">
                  または上の「こちらを削除」で1件削除
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 仕訳詳細モーダル */}
      {detailEntry && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50"
          onClick={() => setDetailEntry(null)}
        >
          <div
            className="bg-white md:rounded-xl shadow-2xl w-full md:max-w-4xl h-full md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b bg-teal-50/80 flex-shrink-0">
              <h3 className="text-base md:text-lg font-bold text-foreground">仕訳詳細</h3>
              <button
                onClick={() => setDetailEntry(null)}
                className="p-1.5 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* モーダルコンテンツ */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                {/* 左側: 元画像（モバイルでは折りたたみ） */}
                <div className="lg:border-r">
                  <div className="bg-teal-50/80 px-4 py-2 border-b">
                    <p className="text-xs font-medium text-teal-700 truncate">
                      元ファイル: {detailEntry.filename}
                    </p>
                  </div>
                  <div className="p-3 md:p-4">
                    {detailEntry.fileType === "pdf" ? (
                      <iframe
                        src={`/api/files?path=${encodeURIComponent(detailEntry.filepath)}`}
                        className="w-full border rounded"
                        style={{ height: window.innerWidth < 768 ? "250px" : "500px" }}
                        title="PDF"
                      />
                    ) : (() => {
                      const matchedPage = detailEntry.pageId
                        ? detailEntry.pages.find((p) => p.id === detailEntry.pageId)
                        : detailEntry.pages[0];
                      return matchedPage ? (
                        <div className="overflow-auto max-h-[250px] md:max-h-[500px]">
                          <Image
                            src={`/api/files?path=${encodeURIComponent(matchedPage.imagePath)}`}
                            alt={`ページ ${matchedPage.pageNumber}`}
                            width={600}
                            height={850}
                            className="w-full h-auto border rounded"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="text-center py-8 md:py-12 text-gray-400 text-sm">
                          画像がありません
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* 右側: 仕訳編集フォーム */}
                <div className="p-4 md:p-6 space-y-4 overflow-y-auto border-t lg:border-t-0">
                  {/* ステータス */}
                  <div className="flex items-center gap-2">
                    {detailEntry.isConfirmed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                        <Check className="w-3 h-3" />
                        確認済
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full">
                        未確認
                      </span>
                    )}
                    {detailEntry.aiSuggested && (
                      <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                        AI推測
                      </span>
                    )}
                  </div>

                  {/* 編集フォーム */}
                  <div className="space-y-3">
                    {/* 日付 */}
                    <div>
                      <label className="block text-xs font-medium text-teal-700 mb-1">日付</label>
                      <input
                        type="date"
                        value={editForm.date || ""}
                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    {/* 摘要 */}
                    <div>
                      <label className="block text-xs font-medium text-teal-700 mb-1">摘要</label>
                      <input
                        type="text"
                        value={editForm.description || ""}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    {/* 勘定科目 */}
                    <div>
                      <label className="block text-xs font-medium text-teal-700 mb-1">勘定科目</label>
                      <select
                        value={editForm.accountCode || ""}
                        onChange={(e) => {
                          const acc = accounts.find((a) => a.code === e.target.value);
                          setEditForm({
                            ...editForm,
                            accountCode: e.target.value,
                            accountName: acc?.name || "",
                            subAccountCode: "",
                            subAccountName: "",
                          });
                        }}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        <option value="">-- 選択してください --</option>
                        {CATEGORY_ORDER.map((category) => {
                          const catAccounts = accounts.filter((a) => a.category === category);
                          if (catAccounts.length === 0) return null;
                          return (
                            <optgroup key={category} label={category}>
                              {catAccounts.map((a) => (
                                <option key={a.code} value={a.code}>{a.name}</option>
                              ))}
                            </optgroup>
                          );
                        })}
                        {accounts
                          .filter((a) => !CATEGORY_ORDER.includes(a.category))
                          .map((a) => (
                            <option key={a.code} value={a.code}>{a.name}</option>
                          ))}
                      </select>
                    </div>

                    {/* 補助科目 */}
                    <div>
                      <label className="block text-xs font-medium text-teal-700 mb-1">補助科目</label>
                      {(() => {
                        const selectedAcc = accounts.find((a) => a.code === editForm.accountCode);
                        return (
                          <SubAccountCombobox
                            subAccounts={selectedAcc?.subAccounts || []}
                            value={editForm.subAccountCode || ""}
                            valueName={editForm.subAccountName || ""}
                            onChange={(code, name) =>
                              setEditForm({ ...editForm, subAccountCode: code, subAccountName: name })
                            }
                            accountId={selectedAcc?.id || ""}
                            clientId={getSelectedClientId()}
                            onSubAccountAdded={fetchAccounts}
                          />
                        );
                      })()}
                    </div>

                    {/* 借方金額 */}
                    <div>
                      <label className="block text-xs font-medium text-teal-700 mb-1">借方金額</label>
                      <input
                        type="number"
                        value={editForm.debitAmount || 0}
                        onChange={(e) => setEditForm({ ...editForm, debitAmount: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border rounded-lg text-sm text-right font-mono focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    {/* 貸方金額 */}
                    <div>
                      <label className="block text-xs font-medium text-teal-700 mb-1">貸方金額</label>
                      <input
                        type="number"
                        value={editForm.creditAmount || 0}
                        onChange={(e) => setEditForm({ ...editForm, creditAmount: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border rounded-lg text-sm text-right font-mono focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    {/* 税区分 */}
                    <div>
                      <label className="block text-xs font-medium text-teal-700 mb-1">税区分</label>
                      <select
                        value={editForm.taxRate || ""}
                        onChange={(e) => setEditForm({ ...editForm, taxRate: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      >
                        <option value="">-- 選択してください --</option>
                        {TAX_RATE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* AI分類理由 */}
                  {detailEntry.aiReasoning && (
                    <div>
                      <h4 className="text-xs font-medium text-teal-700 mb-1">AI分類理由</h4>
                      <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 whitespace-pre-wrap">
                        {detailEntry.aiReasoning}
                      </div>
                    </div>
                  )}

                  {/* 削除依頼の承認（admin/instructor のみ） */}
                  {pendingDeletionEntryIds.has(detailEntry.id) && (userRole === "admin" || userRole === "instructor") && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-purple-500" />
                        <span className="text-sm font-medium text-purple-700">この仕訳に削除依頼があります</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const reqId = pendingDeletionMap.get(detailEntry.id);
                            if (!reqId) return;
                            setApprovingDeleteId(detailEntry.id);
                            try {
                              const res = await fetch("/api/entries/delete-request/approve", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: reqId }),
                              });
                              if (!res.ok) throw new Error("承認に失敗しました");
                              setDetailEntry(null);
                              await fetchFolder();
                              await fetchPendingDeletions();
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "承認に失敗しました");
                            } finally {
                              setApprovingDeleteId(null);
                            }
                          }}
                          disabled={approvingDeleteId === detailEntry.id}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                        >
                          {approvingDeleteId === detailEntry.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          承認（削除する）
                        </button>
                        <button
                          onClick={async () => {
                            const reqId = pendingDeletionMap.get(detailEntry.id);
                            if (!reqId) return;
                            setApprovingDeleteId(detailEntry.id);
                            try {
                              const res = await fetch("/api/entries/delete-request/approve", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: reqId }),
                              });
                              if (!res.ok) throw new Error("却下に失敗しました");
                              setDetailEntry(null);
                              await fetchPendingDeletions();
                              await fetchFolder();
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "却下に失敗しました");
                            } finally {
                              setApprovingDeleteId(null);
                            }
                          }}
                          disabled={approvingDeleteId === detailEntry.id}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          却下
                        </button>
                      </div>
                    </div>
                  )}

                  {/* アクションボタン */}
                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={handleUpdateEntry}
                      disabled={savingEntry}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                    >
                      {savingEntry ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      更新
                    </button>
                    <button
                      onClick={() => setDetailEntry(null)}
                      disabled={savingEntry}
                      className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* B型: フローティング引き継ぎ完了ボタン（2人パターンでは非表示） */}
      {userRole === "user_b" &&
        !folder.handoffStatus &&
        !folder.doubleCheckStatus &&
        !(userBCount !== null && userBCount >= 2) &&
        folder.documents.length > 0 &&
        folder.documents.every(
          (d) =>
            d.status === "ocr_confirmed" ||
            d.status === "classified" ||
            d.status === "reviewed" ||
            d.status === "exported"
        ) && (
        <div className="fixed bottom-6 right-6 z-40">
          <div className="relative">
            <span className="absolute -top-10 right-0 bg-teal-600 text-white text-sm rounded-full px-3 py-1.5 shadow-lg animate-bounce whitespace-nowrap">
              全て確認済み！引き継ぎしましょう ↓
            </span>
            <button
              onClick={async () => {
                if (!confirm("このフォルダをA型利用者に引き継ぎますか？")) return;
                setHandingOff(true);
                try {
                  const res = await fetch(`/api/folders/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      handoffStatus: "handed_off",
                      handoffBy: effectiveUserName,
                    }),
                  });
                  if (!res.ok) throw new Error("引き継ぎに失敗しました");
                  folder.documents
                    .filter(d => d.status === "ocr_confirmed")
                    .forEach(doc => {
                      fetch("/api/classify", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ documentId: doc.id }),
                      }).catch(() => {});
                    });
                  router.push("/");
                } catch (err) {
                  alert(err instanceof Error ? err.message : "引き継ぎに失敗しました");
                } finally {
                  setHandingOff(false);
                }
              }}
              disabled={handingOff}
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 rounded-full shadow-xl transition-colors disabled:opacity-50"
            >
              {handingOff ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
              引き継ぎ完了
            </button>
          </div>
        </div>
      )}

      {/* A型: フローティングCSVエクスポートボタン（アラート未解消時は非表示） */}
      {canViewJournal &&
        !hasUnresolvedAlerts &&
        folder.documents.length > 0 &&
        folder.documents.every(
          (d) => d.status === "reviewed" || d.status === "exported"
        ) && (
        <div className="fixed bottom-6 right-6 z-40">
          <div className="relative">
            {!showFormatPicker && (
              <span className="absolute -top-10 right-0 bg-teal-600 text-white text-sm rounded-full px-3 py-1.5 shadow-lg animate-bounce whitespace-nowrap">
                全て確認済み！エクスポートしましょう ↓
              </span>
            )}
            {showFormatPicker && (
              <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-2xl border p-3 w-56">
                <p className="text-xs font-medium text-teal-700 mb-2">出力形式を選択</p>
                <div className="space-y-1">
                  {[
                    { value: "generic" as const, label: "汎用CSV" },
                    { value: "yayoi" as const, label: "弥生会計形式" },
                    { value: "freee" as const, label: "freee形式" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleFolderExport(opt.value)}
                      disabled={exporting}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-teal-50 hover:text-teal-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={() => setShowFormatPicker(!showFormatPicker)}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-full shadow-xl transition-colors disabled:opacity-50"
            >
              {exporting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              CSVエクスポート
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
