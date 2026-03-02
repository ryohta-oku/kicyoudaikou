"use client";

import { useEffect, useState, useCallback, useRef, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getEffectiveRole } from "@/lib/roleSimulation";
import { getSelectedClientId } from "@/lib/client";
import {
  FileText,
  ArrowLeft,
  Loader2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ClassifyEditor, { type ClassifyEntry } from "@/components/ClassifyEditor";
import MismatchAlert from "@/components/MismatchAlert";
import { useWorkLogger } from "@/hooks/useWorkLogger";

interface Document {
  id: string;
  filename: string;
  filepath: string;
  fileType: string;
  status: string;
  pages: {
    id: string;
    pageNumber: number;
    imagePath: string;
  }[];
  journalEntries: ClassifyEntry[];
}

interface Account {
  id: string;
  code: string;
  name: string;
  category: string;
  subAccounts: { id: string; code: string; name: string }[];
}

interface FolderInfo {
  id: string;
  name: string;
  documents: { id: string; filename: string; status: string }[];
}

export default function ClassifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [folder, setFolder] = useState<FolderInfo | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [classifyingDocIds, setClassifyingDocIds] = useState<Set<string>>(new Set());
  const [classifyError, setClassifyError] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const classifyStartedRef = useRef(false);

  const effectiveRole = getEffectiveRole(session?.user?.role || "");

  // 工数記録: 仕訳分類ページの滞在時間
  useWorkLogger("classify", effectiveRole !== "user_b", {
    sessionId: typeof window !== "undefined" ? localStorage.getItem("workSessionId") : null,
    userId: session?.user?.id || "",
    userName: session?.user?.name || "",
    userRole: effectiveRole,
    folderId: id,
  });

  // B型利用者はアクセス不可 → フォルダ詳細にリダイレクト
  useEffect(() => {
    if (sessionStatus === "authenticated" && effectiveRole === "user_b") {
      router.replace(`/folders/${id}`);
    }
  }, [sessionStatus, effectiveRole, router, id]);

  /** フォルダ情報を取得 */
  const fetchFolder = useCallback(async () => {
    const res = await fetch(`/api/folders/${id}`);
    const data = await res.json();
    return data.folder as FolderInfo | null;
  }, [id]);

  /** 勘定科目マスター取得 */
  const fetchAccounts = useCallback(async () => {
    const clientId = getSelectedClientId();
    const url = clientId ? `/api/accounts?clientId=${clientId}` : "/api/accounts";
    const res = await fetch(url);
    const data = await res.json();
    return (data.accounts || []) as Account[];
  }, []);

  /** ドキュメント詳細を取得 */
  const fetchDocument = useCallback(async (docId: string): Promise<Document | null> => {
    const res = await fetch(`/api/documents/${docId}`);
    const data = await res.json();
    return data.document || null;
  }, []);

  /** 1件のドキュメントのAI分類を実行 */
  const runClassifyDoc = useCallback(async (docId: string) => {
    setClassifyingDocIds((prev) => new Set(prev).add(docId));
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "仕訳分類に失敗しました");
      }
      // 分類後にドキュメント再取得
      const doc = await fetchDocument(docId);
      if (doc) {
        setDocuments((prev) => {
          const exists = prev.find((d) => d.id === docId);
          if (exists) {
            return prev.map((d) => (d.id === docId ? doc : d));
          }
          return [...prev, doc];
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "仕訳分類に失敗しました";
      setClassifyError(message);
    } finally {
      setClassifyingDocIds((prev) => {
        const next = new Set(prev);
        next.delete(docId);
        return next;
      });
    }
  }, [fetchDocument]);

  /** 初回ロード */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [folderData, accountsData] = await Promise.all([
          fetchFolder(),
          fetchAccounts(),
        ]);

        if (cancelled || !folderData) return;
        setFolder(folderData);
        setAccounts(accountsData);

        // 対象ドキュメント: ocr_confirmed 以降
        const eligibleDocs = folderData.documents.filter(
          (d) =>
            d.status === "ocr_confirmed" ||
            d.status === "classified" ||
            d.status === "reviewed" ||
            d.status === "exported"
        );

        // 既に分類済みのドキュメントの詳細を取得
        const classifiedDocs = eligibleDocs.filter(
          (d) => d.status === "classified" || d.status === "reviewed" || d.status === "exported"
        );
        const unclassifiedDocs = eligibleDocs.filter(
          (d) => d.status === "ocr_confirmed"
        );

        // 分類済みドキュメントの詳細を並列取得
        if (classifiedDocs.length > 0) {
          const docs = await Promise.all(
            classifiedDocs.map((d) => fetchDocument(d.id))
          );
          if (!cancelled) {
            setDocuments(docs.filter((d): d is Document => d !== null));
          }
        }

        setLoading(false);

        // 未分類ドキュメントを自動分類
        if (!classifyStartedRef.current && unclassifiedDocs.length > 0) {
          classifyStartedRef.current = true;
          for (const doc of unclassifiedDocs) {
            if (cancelled) break;
            await (async () => {
              setClassifyingDocIds((prev) => new Set(prev).add(doc.id));
              try {
                const res = await fetch("/api/classify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ documentId: doc.id }),
                });
                if (!res.ok) {
                  const data = await res.json();
                  throw new Error(data.error || "仕訳分類に失敗しました");
                }
                const fetchedDoc = await fetchDocument(doc.id);
                if (fetchedDoc && !cancelled) {
                  setDocuments((prev) => [...prev, fetchedDoc]);
                }
              } catch (err) {
                const message = err instanceof Error ? err.message : "仕訳分類に失敗しました";
                if (!cancelled) setClassifyError(message);
              } finally {
                if (!cancelled) {
                  setClassifyingDocIds((prev) => {
                    const next = new Set(prev);
                    next.delete(doc.id);
                    return next;
                  });
                }
              }
            })();
          }
        } else if (unclassifiedDocs.length === 0) {
          // 全て分類済み
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load classify page:", err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchFolder, fetchAccounts, fetchDocument]);

  /** 仕訳エントリ更新 */
  const handleEntryUpdate = useCallback(async (docId: string, entryId: string, data: Partial<ClassifyEntry>) => {
    // debitAmount, creditAmount は数値に変換
    const payload: Record<string, unknown> = { id: entryId };
    for (const [key, value] of Object.entries(data)) {
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

    // ドキュメントデータを再取得して更新
    const doc = await fetchDocument(docId);
    if (doc) {
      setDocuments((prev) => prev.map((d) => (d.id === docId ? doc : d)));
    }
  }, [fetchDocument]);

  /** 仕訳エントリ確認 */
  const handleEntryConfirm = useCallback(async (entryId: string) => {
    const res = await fetch("/api/entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entryId, isConfirmed: true }),
    });
    if (!res.ok) throw new Error("確認に失敗しました");

    // ローカルのdocumentsステートも同期
    setDocuments((prev) =>
      prev.map((d) => ({
        ...d,
        journalEntries: d.journalEntries.map((e) =>
          e.id === entryId ? { ...e, isConfirmed: true } : e
        ),
      }))
    );
  }, []);

  /** 全エントリ確認完了時 → ステータスを reviewed に更新 */
  const handleAllEntriesConfirmed = useCallback(async (docId: string) => {
    try {
      await fetch(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "reviewed" }),
      });
      // ドキュメントデータを更新
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === docId
            ? { ...d, status: "reviewed", journalEntries: d.journalEntries.map((e) => ({ ...e, isConfirmed: true })) }
            : d
        )
      );
      // フォルダ情報も更新
      setFolder((prev) =>
        prev
          ? {
              ...prev,
              documents: prev.documents.map((d) =>
                d.id === docId ? { ...d, status: "reviewed" } : d
              ),
            }
          : null
      );
    } catch (error) {
      console.error("Failed to update document status:", error);
    }
  }, []);

  // 全エントリ確認済みの classified ドキュメントを自動で reviewed に昇格
  const autoReviewedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    documents.forEach((doc) => {
      if (
        doc.status === "classified" &&
        doc.journalEntries.length > 0 &&
        doc.journalEntries.every((e) => e.isConfirmed) &&
        !autoReviewedRef.current.has(doc.id)
      ) {
        autoReviewedRef.current.add(doc.id);
        handleAllEntriesConfirmed(doc.id);
      }
    });
  }, [documents, handleAllEntriesConfirmed]);

  // 全ドキュメント完了チェック
  useEffect(() => {
    if (documents.length === 0 || !folder) return;
    const eligibleCount = folder.documents.filter(
      (d) =>
        d.status === "ocr_confirmed" ||
        d.status === "classified" ||
        d.status === "reviewed" ||
        d.status === "exported"
    ).length;
    // ステータスが reviewed/exported、またはエントリが全確認済みなら完了とみなす
    const doneCount = documents.filter(
      (d) =>
        d.status === "reviewed" ||
        d.status === "exported" ||
        (d.journalEntries.length > 0 && d.journalEntries.every((e) => e.isConfirmed))
    ).length;
    setAllDone(eligibleCount > 0 && doneCount >= eligibleCount);
  }, [documents, folder]);

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
        <Link href="/" className="text-teal-600 hover:underline mt-4 inline-block">
          ダッシュボードに戻る
        </Link>
      </div>
    );
  }

  const isClassifying = classifyingDocIds.size > 0;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Link
          href={`/folders/${id}`}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          フォルダに戻る
        </Link>
        <h1 className="text-xl font-bold text-gray-900">
          {folder.name} - 仕訳分類
        </h1>
      </div>

      {/* 不一致アラート */}
      <MismatchAlert folderId={id} />

      {/* 分類中バナー */}
      {isClassifying && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-purple-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-purple-900">
              AI仕訳分類中... ({documents.length}/{folder.documents.filter(
                (d) => d.status === "ocr_confirmed" || d.status === "classified" || d.status === "reviewed" || d.status === "exported"
              ).length} 完了)
            </p>
            <p className="text-xs text-purple-700 mt-0.5">
              処理が完了するまでこのページでお待ちください
            </p>
          </div>
        </div>
      )}

      {/* 分類エラー */}
      {classifyError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600">{classifyError}</p>
        </div>
      )}

      {/* 説明バナー */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <span className="font-medium">AIが推測した勘定科目</span>には「AI推測」タグが表示されています。
          内容を確認し、必要に応じて修正してから「確認完了」ボタンを押してください。
        </p>
      </div>

      {/* ドキュメントごとの分類エディタ */}
      {documents.map((doc) => {
        const docAllConfirmed =
          doc.journalEntries.length > 0 &&
          doc.journalEntries.every((e) => e.isConfirmed);

        return (
          <div key={doc.id} className="bg-white rounded-xl border overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-medium text-gray-700">
                {doc.filename}
              </h3>
              {docAllConfirmed && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  確認完了
                </span>
              )}
              {doc.journalEntries.length > 0 && !docAllConfirmed && (
                <span className="text-xs text-gray-500">
                  ({doc.journalEntries.filter((e) => e.isConfirmed).length}/{doc.journalEntries.length} 確認済)
                </span>
              )}
            </div>
            <div className="p-4">
              {doc.journalEntries.length > 0 ? (
                <ClassifyEditor
                  pages={doc.pages}
                  documentFileType={doc.fileType}
                  documentFilepath={doc.filepath}
                  entries={doc.journalEntries}
                  accounts={accounts}
                  clientId={getSelectedClientId()}
                  onEntryUpdate={(entryId, data) =>
                    handleEntryUpdate(doc.id, entryId, data)
                  }
                  onEntryConfirm={handleEntryConfirm}
                  onAllEntriesConfirmed={() =>
                    handleAllEntriesConfirmed(doc.id)
                  }
                  onAccountsRefresh={async () => {
                    const refreshed = await fetchAccounts();
                    setAccounts(refreshed);
                  }}
                />
              ) : (
                <div className="text-center py-8 text-gray-500 text-sm">
                  仕訳データがありません
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* 分類中のドキュメント（まだデータ未取得） */}
      {folder.documents
        .filter(
          (d) =>
            classifyingDocIds.has(d.id) &&
            !documents.find((doc) => doc.id === d.id)
        )
        .map((doc) => (
          <div key={doc.id} className="bg-white rounded-xl border overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-medium text-gray-700">
                {doc.filename}
              </h3>
            </div>
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">AI分類中...</span>
            </div>
          </div>
        ))}

      {/* フローティング仕訳完了ボタン */}
      {allDone && (
        <div className="fixed bottom-6 right-6 z-40">
          <div className="relative">
            <span className="absolute -top-10 right-0 bg-teal-600 text-white text-sm rounded-full px-3 py-1.5 shadow-lg animate-bounce whitespace-nowrap">
              全て確認済み！次へ進みましょう ↓
            </span>
            <Link
              href={`/folders/${id}`}
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium text-white bg-green-600 hover:bg-green-700 rounded-full shadow-xl transition-colors"
            >
              <CheckCircle2 className="w-5 h-5" />
              仕訳完了
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
