"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS, formatCurrency } from "@/lib/utils";
import { getSelectedClientId } from "@/lib/client";
import Image from "next/image";
import OCREditor, { type PageUpdateData } from "@/components/OCREditor";
import SubAccountCombobox from "@/components/SubAccountCombobox";

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
  documents: Document[];
}

export default function FolderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [loading, setLoading] = useState(true);
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

  const fetchFolder = useCallback(async () => {
    try {
      const res = await fetch(`/api/folders/${id}`);
      const data = await res.json();
      setFolder(data.folder || null);
      return data.folder as Folder | null;
    } catch (error) {
      console.error("Failed to fetch folder:", error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

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

  // 初回ロード時に自動OCR開始 & OCR完了ドキュメントの詳細を一括取得
  useEffect(() => {
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
        return { href: `/folders/${id}/classify`, label: "仕訳確認" };
      case "reviewed":
        return { href: `/documents/${docId}/export`, label: "エクスポート" };
      case "exported":
        return { href: `/documents/${docId}/export`, label: "再エクスポート" };
      default:
        return { href: null, label: "" };
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
        <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
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
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          ダッシュボード
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <h1 className="text-lg md:text-xl font-bold text-gray-900 truncate">{folder.name}</h1>
          <span className="text-xs md:text-sm text-gray-500 flex-shrink-0">
            {folder.documents.length} ファイル
          </span>
        </div>
      </div>

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
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
              {/* 左列 */}
              <div className="divide-y divide-gray-100">
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-gray-500 flex-shrink-0">フォルダ名</dt>
                  <dd className="text-sm text-gray-900">{folder.name}</dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-gray-500 flex-shrink-0">作成日時</dt>
                  <dd className="text-sm text-gray-900">
                    {new Date(folder.createdAt).toLocaleString("ja-JP")}
                  </dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-gray-500 flex-shrink-0">得意先</dt>
                  <dd className="text-sm text-gray-900">{folder.client?.name || "-"}</dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-gray-500 flex-shrink-0">ステータス</dt>
                  <dd className="text-sm">
                    <span className={cn(
                      "inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium",
                      overallStatus === "エクスポート済" ? "bg-emerald-100 text-emerald-800" :
                      overallStatus === "確認済" ? "bg-green-100 text-green-800" :
                      overallStatus === "仕訳済" ? "bg-purple-100 text-purple-800" :
                      "bg-blue-100 text-blue-800"
                    )}>
                      {overallStatus}
                    </span>
                  </dd>
                </div>
              </div>
              {/* 右列 */}
              <div className="divide-y divide-gray-100">
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-gray-500 flex-shrink-0">ファイル数</dt>
                  <dd className="text-sm text-gray-900">{folder.documents.length} 件</dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-gray-500 flex-shrink-0">明細数</dt>
                  <dd className="text-sm text-gray-900">{allJournalEntries.length} 件</dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-gray-500 flex-shrink-0">合計金額</dt>
                  <dd className="text-sm">
                    {allJournalEntries.length > 0 ? (
                      <>
                        <span className="font-medium text-blue-700 text-base">
                          {formatCurrency(totalAmount)}
                        </span>
                        <span className="text-gray-500 text-xs ml-1">
                          (内消費税: {formatCurrency(totalTax)})
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </dd>
                </div>
                <div className="flex px-5 py-3">
                  <dt className="w-28 text-sm font-medium text-gray-500 flex-shrink-0">確認状況</dt>
                  <dd className="text-sm text-gray-900">
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-900">
              OCR処理中... ({processedCount}/{totalCount} 完了)
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
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
        <div className="text-center py-16 bg-white rounded-xl border">
          <FileText className="mx-auto h-16 w-16 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">
            ドキュメントがありません
          </h3>
        </div>
      ) : (
        <>
          {/* デスクトップ: テーブル表示 */}
          <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">作成日</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">ファイル名</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">ステータス</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">エクスポート</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {folder.documents.map((doc) => {
                    const nextAction = getNextAction(doc.status, doc.id);
                    const canExport = doc.status === "reviewed" || doc.status === "exported";
                    const isProcessing = ocrProcessingIds.has(doc.id);
                    return (
                      <tr key={doc.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                          {new Date(doc.createdAt).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                            <span className="text-gray-900 truncate max-w-[250px]">{doc.filename}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
                            <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-medium", STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-800")}>
                              {isProcessing ? "OCR処理中..." : STATUS_LABELS[doc.status] || doc.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          {canExport ? (
                            <Link href={`/documents/${doc.id}/export`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
                              <Download className="w-3.5 h-3.5" />CSV出力
                            </Link>
                          ) : <span className="text-xs text-gray-400">-</span>}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-2">
                            {nextAction.label === "" ? null : nextAction.href ? (
                              <Link href={nextAction.href} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                <ArrowRight className="w-4 h-4" />{nextAction.label}
                              </Link>
                            ) : nextAction.action ? (
                              <button onClick={nextAction.action} disabled={isProcessing} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
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
              const canExport = doc.status === "reviewed" || doc.status === "exported";
              const isProcessing = ocrProcessingIds.has(doc.id);
              return (
                <div key={doc.id} className="bg-white rounded-xl border p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">{doc.filename}</span>
                      </div>
                      <p className="text-xs text-gray-500">{new Date(doc.createdAt).toLocaleDateString("ja-JP")}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />}
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium", STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-800")}>
                        {isProcessing ? "OCR処理中..." : STATUS_LABELS[doc.status] || doc.status}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t">
                    {nextAction.label !== "" && (
                      nextAction.href ? (
                        <Link href={nextAction.href} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <ArrowRight className="w-3.5 h-3.5" />{nextAction.label}
                        </Link>
                      ) : nextAction.action ? (
                        <button onClick={nextAction.action} disabled={isProcessing} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
                          {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                          {nextAction.label}
                        </button>
                      ) : null
                    )}
                    {canExport && (
                      <Link href={`/documents/${doc.id}/export`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors">
                        <Download className="w-3.5 h-3.5" />CSV出力
                      </Link>
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

      {/* 仕訳明細セクション (Money Forward風) */}
      {(() => {
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
        const duplicateIds = new Set<string>();
        for (let i = 0; i < allEntries.length; i++) {
          for (let j = i + 1; j < allEntries.length; j++) {
            const a = allEntries[i];
            const b = allEntries[j];
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
            }
          }
        }

        // アラート判定
        const getAlerts = (entry: typeof allEntries[0]): string[] => {
          const alerts: string[] = [];
          if (!entry.date) alerts.push("日付");
          if (!entry.description) alerts.push("摘要");
          if (entry.debitAmount <= 0 && entry.creditAmount <= 0) alerts.push("金額");
          if (!entry.accountCode && !entry.accountName) alerts.push("勘定科目");
          if (!entry.taxRate) alerts.push("税区分");
          if (duplicateIds.has(entry.id)) alerts.push("重複の可能性");
          return alerts;
        };
        const alertCount = allEntries.filter((e) => getAlerts(e).length > 0).length;
        const missingFieldCount = allEntries.filter((e) => {
          const a = getAlerts(e);
          return a.some((msg) => msg !== "重複の可能性");
        }).length;
        const duplicateCount = duplicateIds.size;

        return (
          <section className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-base md:text-lg font-bold text-gray-900">
                仕訳明細
                <span className="ml-2 text-sm font-normal text-gray-500">
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
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors self-start"
              >
                <Pencil className="w-4 h-4" />
                仕訳確認・編集
              </Link>
            </div>

            {/* アラートバナー */}
            {(missingFieldCount > 0 || duplicateCount > 0) && (
              <div className="space-y-2">
                {missingFieldCount > 0 && (
                  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                    <span className="text-sm text-amber-800">
                      <strong>{missingFieldCount} 件</strong>の仕訳に入力不足があります。詳細ボタンから修正してください。
                    </span>
                  </div>
                )}
                {duplicateCount > 0 && (
                  <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                    <CircleAlert className="h-5 w-5 text-orange-600 flex-shrink-0 animate-alert-bounce" />
                    <span className="text-sm text-orange-800">
                      <strong>{duplicateCount} 件</strong>の仕訳に重複の可能性があります（日付・金額・勘定科目が一致、別ファイル由来）。不要な場合は詳細から削除してください。
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* デスクトップ: テーブル表示 */}
            <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">日付</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 whitespace-nowrap">アラート</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">支払先・内容</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600 whitespace-nowrap">金額（税込）</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">勘定科目</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">税区分</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 whitespace-nowrap">確認</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">ファイル</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600 whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allEntries.map((entry) => {
                      const alerts = getAlerts(entry);
                      const isDuplicate = duplicateIds.has(entry.id);
                      const missingAlerts = alerts.filter((a) => a !== "重複の可能性");
                      return (
                      <tr
                        key={entry.id}
                        className={cn(
                          "border-b hover:bg-gray-50 transition-colors",
                          isDuplicate ? "bg-orange-50/40" : "",
                          !isDuplicate && missingAlerts.length > 0 ? "bg-amber-50/40" : "",
                          !isDuplicate && alerts.length === 0 && entry.isConfirmed ? "bg-green-50/30" : "",
                          !isDuplicate && alerts.length === 0 && entry.aiSuggested && !entry.isConfirmed ? "bg-yellow-50/30" : ""
                        )}
                      >
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">{entry.date || <span className="text-red-400">-</span>}</td>
                        <td className="px-4 py-3 text-center">
                          {alerts.length > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              {missingAlerts.length > 0 && (
                                <div className="relative group">
                                  <button type="button" className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-700 rounded-lg text-[11px] font-medium transition-colors cursor-pointer">
                                    <CircleAlert className="w-4 h-4 animate-alert-bounce text-amber-600" />
                                    <span>要確認</span>
                                  </button>
                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 pointer-events-none">
                                    <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2.5 whitespace-nowrap shadow-lg">
                                      <p className="font-medium mb-1 text-amber-300 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />未入力の項目
                                      </p>
                                      {missingAlerts.map((a) => (
                                        <p key={a} className="text-gray-200 leading-5">・{a}</p>
                                      ))}
                                    </div>
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-800" />
                                  </div>
                                </div>
                              )}
                              {isDuplicate && (
                                <div className="relative group">
                                  <button type="button" className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg text-[11px] font-medium transition-colors cursor-pointer">
                                    <CircleAlert className="w-4 h-4 animate-alert-bounce text-orange-600" />
                                    <span>重複？</span>
                                  </button>
                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 pointer-events-none">
                                    <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2.5 whitespace-nowrap shadow-lg">
                                      <p className="font-medium mb-1 text-orange-300 flex items-center gap-1">
                                        <CircleAlert className="w-3 h-3" />重複の可能性
                                      </p>
                                      <p className="text-gray-300 leading-5 text-[11px]">同じ金額・勘定科目の仕訳が</p>
                                      <p className="text-gray-300 leading-5 text-[11px]">別ファイルにあります</p>
                                    </div>
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-800" />
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[280px]">
                          <div className="truncate text-gray-900">{entry.description}</div>
                          {entry.subAccountName && <div className="text-xs text-gray-500 truncate">{entry.subAccountName}</div>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap text-gray-900">
                          {entry.debitAmount > 0 ? formatCurrency(entry.debitAmount) : entry.creditAmount > 0 ? formatCurrency(entry.creditAmount) : "-"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {entry.accountName}
                          {entry.aiSuggested && !entry.isConfirmed && <span className="ml-1 text-xs text-yellow-600 bg-yellow-100 px-1 rounded">AI</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">{entry.taxRate || "-"}</td>
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
                          <button onClick={() => openDetail(entry)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200">
                            詳細
                          </button>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  合計金額: <span className="font-medium text-gray-900">{formatCurrency(allEntries.reduce((sum, e) => sum + (e.debitAmount || e.creditAmount || 0), 0))}</span>
                </div>
                <Link href={`/folders/${id}/classify`} className="text-sm text-blue-600 hover:underline">仕訳確認ページへ →</Link>
              </div>
            </div>

            {/* モバイル: カード表示 */}
            <div className="md:hidden space-y-3">
              {allEntries.map((entry) => {
                const alerts = getAlerts(entry);
                const isDuplicate = duplicateIds.has(entry.id);
                const missingAlerts = alerts.filter((a) => a !== "重複の可能性");
                return (
                <div
                  key={entry.id}
                  className={cn(
                    "bg-white rounded-xl border p-4 space-y-2",
                    isDuplicate ? "border-orange-300 bg-orange-50/40" : "",
                    !isDuplicate && missingAlerts.length > 0 ? "border-amber-300 bg-amber-50/40" : "",
                    alerts.length === 0 && entry.isConfirmed ? "border-green-200 bg-green-50/30" : "",
                    alerts.length === 0 && entry.aiSuggested && !entry.isConfirmed ? "border-yellow-200 bg-yellow-50/30" : ""
                  )}
                >
                  {isDuplicate && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-100 rounded-lg text-orange-700 text-xs font-medium">
                      <CircleAlert className="w-4 h-4 animate-alert-bounce text-orange-600 flex-shrink-0" />
                      <span>重複の可能性（別ファイルに同じ仕訳あり）</span>
                    </div>
                  )}
                  {missingAlerts.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-100 rounded-lg text-amber-700 text-xs font-medium">
                      <CircleAlert className="w-4 h-4 animate-alert-bounce text-amber-600 flex-shrink-0" />
                      <span>未入力: {missingAlerts.join("、")}</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{entry.description || <span className="text-red-400">（摘要なし）</span>}</p>
                      {entry.subAccountName && <p className="text-xs text-gray-500 truncate">{entry.subAccountName}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-mono font-medium text-gray-900">
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
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200"
                    >
                      詳細
                    </button>
                  </div>
                </div>
              );
              })}
              <div className="bg-white rounded-xl border px-4 py-3 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  合計: <span className="font-medium text-gray-900">{formatCurrency(allEntries.reduce((sum, e) => sum + (e.debitAmount || e.creditAmount || 0), 0))}</span>
                </div>
                <Link href={`/folders/${id}/classify`} className="text-xs text-blue-600 hover:underline">仕訳確認 →</Link>
              </div>
            </div>
          </section>
        );
      })()}

      {/* OCR内容確認セクション */}
      {(() => {
        // OCRデータがあるドキュメント（ocr_complete + ocr_confirmed）
        const ocrVisibleDocs = folder.documents.filter((d) => ocrDocsData[d.id]);
        if (ocrVisibleDocs.length === 0) return null;

        const unconfirmedCount = ocrVisibleDocs.filter((d) => !fullyConfirmedDocIds.has(d.id)).length;
        const allOcrConfirmed = unconfirmedCount === 0;
        // 仕訳分類対象 = ocr_confirmed のドキュメント（classified以降は除外）
        const hasClassifyTarget = folder.documents.some(
          (d) => d.status === "ocr_confirmed"
        );

        return (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                OCR内容確認
                {unconfirmedCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({unconfirmedCount} 件未確認)
                  </span>
                )}
              </h2>
              {allOcrConfirmed && hasClassifyTarget && (
                <button
                  onClick={() => router.push(`/folders/${id}/classify`)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  一括仕訳分類
                </button>
              )}
            </div>

            {!allOcrConfirmed && (
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
                <div key={doc.id} className="bg-white rounded-xl border overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b flex items-center gap-2">
                    <FileText className="w-4 h-4 text-red-500" />
                    <h3 className="text-sm font-medium text-gray-700">{doc.filename}</h3>
                    {isConfirmed && (
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
                        readOnly={isConfirmed}
                        onPageUpdate={handlePageUpdate}
                        onPageConfirm={async (pageId) => {
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
                        }}
                        onAllPagesConfirmed={() => handleAllPagesConfirmed(doc.id)}
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
            <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b bg-gray-50 flex-shrink-0">
              <h3 className="text-base md:text-lg font-bold text-gray-900">仕訳詳細</h3>
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
                  <div className="bg-gray-50 px-4 py-2 border-b">
                    <p className="text-xs font-medium text-gray-500 truncate">
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
                      <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
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
                      <label className="block text-xs font-medium text-gray-500 mb-1">日付</label>
                      <input
                        type="date"
                        value={editForm.date || ""}
                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* 摘要 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">摘要</label>
                      <input
                        type="text"
                        value={editForm.description || ""}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* 勘定科目 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">勘定科目</label>
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
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                      <label className="block text-xs font-medium text-gray-500 mb-1">補助科目</label>
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
                      <label className="block text-xs font-medium text-gray-500 mb-1">借方金額</label>
                      <input
                        type="number"
                        value={editForm.debitAmount || 0}
                        onChange={(e) => setEditForm({ ...editForm, debitAmount: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border rounded-lg text-sm text-right font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* 貸方金額 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">貸方金額</label>
                      <input
                        type="number"
                        value={editForm.creditAmount || 0}
                        onChange={(e) => setEditForm({ ...editForm, creditAmount: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border rounded-lg text-sm text-right font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* 税区分 */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">税区分</label>
                      <select
                        value={editForm.taxRate || ""}
                        onChange={(e) => setEditForm({ ...editForm, taxRate: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                      <h4 className="text-xs font-medium text-gray-500 mb-1">AI分類理由</h4>
                      <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 whitespace-pre-wrap">
                        {detailEntry.aiReasoning}
                      </div>
                    </div>
                  )}

                  {/* アクションボタン */}
                  <div className="pt-2 flex gap-2">
                    <button
                      onClick={handleUpdateEntry}
                      disabled={savingEntry}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
    </div>
  );
}
