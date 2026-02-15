"use client";

import { useState } from "react";
import { Check, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface Page {
  id: string;
  pageNumber: number;
  imagePath: string;
}

export interface ClassifyEntry {
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

interface Account {
  id: string;
  code: string;
  name: string;
  category: string;
  subAccounts: { id: string; code: string; name: string }[];
}

interface ClassifyEditorProps {
  pages: Page[];
  documentFileType: string;
  documentFilepath: string;
  entries: ClassifyEntry[];
  accounts: Account[];
  onEntryUpdate: (entryId: string, data: Partial<ClassifyEntry>) => Promise<void>;
  onEntryConfirm: (entryId: string) => Promise<void>;
  onAllEntriesConfirmed?: () => void;
}

const TAX_RATE_OPTIONS = ["課税10%", "課税8%", "非課税", "不課税", "免税"];

export default function ClassifyEditor({
  pages,
  documentFileType,
  documentFilepath,
  entries,
  accounts,
  onEntryUpdate,
  onEntryConfirm,
  onAllEntriesConfirmed,
}: ClassifyEditorProps) {
  const [currentEntryIndex, setCurrentEntryIndex] = useState(0);
  const [editedEntries, setEditedEntries] = useState<Record<string, Partial<ClassifyEntry>>>({});
  const [confirmedEntries, setConfirmedEntries] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    entries.forEach((e) => {
      initial[e.id] = e.isConfirmed;
    });
    return initial;
  });
  const [savingEntries, setSavingEntries] = useState<Record<string, boolean>>({});

  const currentEntry = entries[currentEntryIndex];

  if (!currentEntry) {
    return (
      <div className="text-center py-12 text-gray-500">
        仕訳エントリがありません
      </div>
    );
  }

  // 現在のエントリの編集中データ or 元データ
  const getFieldValue = <K extends keyof ClassifyEntry>(field: K): ClassifyEntry[K] => {
    const edited = editedEntries[currentEntry.id];
    if (edited && field in edited) {
      return edited[field] as ClassifyEntry[K];
    }
    return currentEntry[field];
  };

  const handleFieldChange = (field: keyof ClassifyEntry, value: string | number) => {
    setEditedEntries((prev) => ({
      ...prev,
      [currentEntry.id]: {
        ...prev[currentEntry.id],
        [field]: value,
      },
    }));
  };

  const handleSave = async (entryId: string) => {
    setSavingEntries((prev) => ({ ...prev, [entryId]: true }));
    try {
      const edited = editedEntries[entryId];
      if (edited) {
        await onEntryUpdate(entryId, edited);
        // 保存成功後、編集状態をクリア
        setEditedEntries((prev) => {
          const next = { ...prev };
          delete next[entryId];
          return next;
        });
      }
    } finally {
      setSavingEntries((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  const handleConfirm = async (entryId: string) => {
    setSavingEntries((prev) => ({ ...prev, [entryId]: true }));
    try {
      // まず編集内容を保存
      const edited = editedEntries[entryId];
      if (edited) {
        await onEntryUpdate(entryId, edited);
        setEditedEntries((prev) => {
          const next = { ...prev };
          delete next[entryId];
          return next;
        });
      }
      // 確認
      await onEntryConfirm(entryId);
      let allDone = false;
      setConfirmedEntries((prev) => {
        const updated = { ...prev, [entryId]: true };
        allDone = entries.every((e) => updated[e.id]);
        return updated;
      });
      if (allDone && onAllEntriesConfirmed) {
        onAllEntriesConfirmed();
      }
    } finally {
      setSavingEntries((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  const handleReset = (entryId: string) => {
    setEditedEntries((prev) => {
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
  };

  // 対応するページを取得（エントリのpageIdに対応）
  const matchedPage = currentEntry.pageId
    ? pages.find((p) => p.id === currentEntry.pageId)
    : pages[0];

  const isPdf = documentFileType === "pdf";
  const isDisabled = confirmedEntries[currentEntry.id];

  // 勘定科目に紐づく補助科目を取得
  const selectedAccount = accounts.find(
    (a) => a.code === getFieldValue("accountCode")
  );
  const subAccounts = selectedAccount?.subAccounts || [];

  return (
    <div className="space-y-4">
      {/* エントリナビゲーション */}
      {entries.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-600 mr-2">仕訳:</span>
          {entries.map((entry, index) => (
            <button
              key={entry.id}
              onClick={() => setCurrentEntryIndex(index)}
              className={cn(
                "w-10 h-10 rounded-lg text-sm font-medium transition-colors",
                index === currentEntryIndex
                  ? "bg-blue-600 text-white"
                  : confirmedEntries[entry.id]
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              )}
            >
              {index + 1}
            </button>
          ))}
          <span className="text-sm text-gray-500 ml-2">
            ({entries.filter((e) => confirmedEntries[e.id]).length}/{entries.length} 確認済)
          </span>
        </div>
      )}

      {/* メインエディタ - 画像とフィールドを並べて表示 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左側: 元画像 / PDF */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="text-sm font-medium text-gray-700">
              {isPdf ? "元PDF" : "元画像"}
              {matchedPage && ` (ページ ${matchedPage.pageNumber})`}
            </h3>
          </div>
          <div className="p-4">
            {isPdf ? (
              <iframe
                src={`/api/files?path=${encodeURIComponent(documentFilepath)}`}
                className="w-full border rounded"
                style={{ height: "600px" }}
                title="PDF"
              />
            ) : matchedPage ? (
              <div className="overflow-auto max-h-[600px]">
                <Image
                  src={`/api/files?path=${encodeURIComponent(matchedPage.imagePath)}`}
                  alt={`ページ ${matchedPage.pageNumber}`}
                  width={800}
                  height={1100}
                  className="w-full h-auto border rounded"
                  unoptimized
                />
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                画像がありません
              </div>
            )}
          </div>
        </div>

        {/* 右側: 仕訳フィールド + AI理由 */}
        <div className="space-y-4">
          {/* 仕訳項目 */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">仕訳項目</h3>
              <div className="flex items-center gap-2">
                {currentEntry.aiSuggested && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">
                    AI推測
                  </span>
                )}
                {confirmedEntries[currentEntry.id] && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                    <Check className="w-3 h-3" />
                    確認済
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 space-y-3">
              {/* 勘定科目 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">勘定科目</label>
                <select
                  value={String(getFieldValue("accountCode"))}
                  onChange={(e) => {
                    const account = accounts.find((a) => a.code === e.target.value);
                    handleFieldChange("accountCode", e.target.value);
                    handleFieldChange("accountName", account?.name || "");
                    // 勘定科目変更時に補助科目をリセット
                    handleFieldChange("subAccountCode", "");
                    handleFieldChange("subAccountName", "");
                  }}
                  disabled={isDisabled}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">-- 選択してください --</option>
                  {/* AIが選んだコードがマスターにない場合も選択肢に表示 */}
                  {currentEntry.accountCode && !accounts.find((a) => a.code === currentEntry.accountCode) && (
                    <option value={currentEntry.accountCode}>
                      {currentEntry.accountCode}: {currentEntry.accountName}
                    </option>
                  )}
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code}: {a.name}（{a.category}）
                    </option>
                  ))}
                </select>
              </div>
              {/* 補助科目 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">補助科目</label>
                {subAccounts.length > 0 ? (
                  <select
                    value={String(getFieldValue("subAccountCode"))}
                    onChange={(e) => {
                      const sub = subAccounts.find((s) => s.code === e.target.value);
                      handleFieldChange("subAccountCode", e.target.value);
                      handleFieldChange("subAccountName", sub?.name || "");
                    }}
                    disabled={isDisabled}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">-- なし --</option>
                    {subAccounts.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}: {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={String(getFieldValue("subAccountName"))}
                    onChange={(e) => handleFieldChange("subAccountName", e.target.value)}
                    disabled={isDisabled}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="補助科目名"
                  />
                )}
              </div>
              {/* 税率区分 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">税率区分</label>
                <select
                  value={String(getFieldValue("taxRate"))}
                  onChange={(e) => handleFieldChange("taxRate", e.target.value)}
                  disabled={isDisabled}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">-- 選択してください --</option>
                  {TAX_RATE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* AI分類理由 */}
          {currentEntry.aiReasoning && (
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h3 className="text-sm font-medium text-gray-700">AI分類理由</h3>
              </div>
              <div className="p-4">
                <textarea
                  value={currentEntry.aiReasoning}
                  readOnly
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 text-gray-700 resize-none"
                />
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleReset(currentEntry.id)}
              disabled={isDisabled || savingEntries[currentEntry.id]}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              元に戻す
            </button>
            <button
              onClick={() => handleSave(currentEntry.id)}
              disabled={isDisabled || savingEntries[currentEntry.id]}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {savingEntries[currentEntry.id] ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              保存
            </button>
            <button
              onClick={() => handleConfirm(currentEntry.id)}
              disabled={isDisabled || savingEntries[currentEntry.id]}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {savingEntries[currentEntry.id] ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              確認完了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

