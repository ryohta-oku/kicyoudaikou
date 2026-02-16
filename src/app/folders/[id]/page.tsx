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
} from "lucide-react";
import { cn, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import OCREditor, { type PageUpdateData } from "@/components/OCREditor";

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

      // OCR未確認のドキュメントのみ詳細を取得（確認済み以降は不要）
      const ocrNeedsReviewDocs = folderData.documents.filter(
        (d: Document) => d.status === "ocr_complete"
      );
      if (ocrNeedsReviewDocs.length > 0) {
        setLoadingOcrDocs(true);
        await Promise.all(ocrNeedsReviewDocs.map((d: Document) => fetchDocFullData(d.id)));
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
        return { href: null, label: "OCR確認（下部）" };
      case "ocr_confirmed":
        return { href: `/folders/${id}/classify`, label: "仕訳分類へ" };
      case "classified":
        return { href: `/folders/${id}/classify`, label: "仕訳確認" };
      case "reviewed":
        return { href: `/documents/${docId}/export`, label: "エクスポート" };
      case "exported":
        return { href: `/documents/${docId}/export`, label: "再エクスポート" };
      default:
        return { href: `/documents/${docId}/ocr-review`, label: "確認" };
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
                  const isProcessing = ocrProcessingIds.has(doc.id);
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
                        <div className="flex items-center gap-2">
                          {isProcessing && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                          )}
                          <span
                            className={cn(
                              "inline-flex px-2.5 py-1 rounded-full text-xs font-medium",
                              STATUS_COLORS[doc.status] ||
                                "bg-gray-100 text-gray-800"
                            )}
                          >
                            {isProcessing
                              ? "OCR処理中..."
                              : STATUS_LABELS[doc.status] || doc.status}
                          </span>
                        </div>
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
                          {nextAction.label === "" ? null : nextAction.href ? (
                            <Link
                              href={nextAction.href}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <ArrowRight className="w-4 h-4" />
                              {nextAction.label}
                            </Link>
                          ) : nextAction.action ? (
                            <button
                              onClick={nextAction.action}
                              disabled={isProcessing}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {isProcessing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <PlayCircle className="w-4 h-4" />
                              )}
                              {nextAction.label}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-400">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {nextAction.label}
                            </span>
                          )}
                          <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            disabled={deletingId === doc.id || isProcessing}
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

      {/* OCR内容確認セクション（ocr_complete のドキュメントのみ表示） */}
      {(() => {
        const ocrNeedsReviewDocs = folder.documents.filter(
          (d) => ocrDocsData[d.id] && !fullyConfirmedDocIds.has(d.id)
        );
        if (ocrNeedsReviewDocs.length === 0) return null;

        return (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                OCR内容確認
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({ocrNeedsReviewDocs.length} 件未確認)
                </span>
              </h2>
            </div>

            {ocrNeedsReviewDocs.map((doc) => {
              const fullDoc = ocrDocsData[doc.id];
              if (!fullDoc) return null;
              return (
                <div key={doc.id} className="bg-white rounded-xl border overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b flex items-center gap-2">
                    <FileText className="w-4 h-4 text-red-500" />
                    <h3 className="text-sm font-medium text-gray-700">{doc.filename}</h3>
                  </div>
                  <div className="p-4">
                    {fullDoc.pages.length > 0 ? (
                      <OCREditor
                        pages={fullDoc.pages}
                        documentFileType={fullDoc.fileType}
                        documentFilepath={fullDoc.filepath}
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
    </div>
  );
}
