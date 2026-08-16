"use client";

import { useState, useCallback } from "react";
import { Check, RotateCcw, Loader2, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import SubAccountCombobox from "./SubAccountCombobox";
import GuideBubble from "./GuideBubble";

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
  clientId?: string | null;
  onEntryUpdate: (entryId: string, data: Partial<ClassifyEntry>) => Promise<void>;
  onEntryConfirm: (entryId: string) => Promise<void>;
  onAllEntriesConfirmed?: () => void;
  onAccountsRefresh?: () => void;
}

const TAX_RATE_OPTIONS = ["課税10%", "課税8%", "非課税", "不課税", "免税"];

const CLASSIFY_CHECK_FIELDS = ["accountCode", "subAccountCode", "taxRate"] as const;

const CATEGORY_ORDER = ["費用", "資産", "負債", "収益", "純資産"];

export default function ClassifyEditor({
  pages,
  documentFileType,
  documentFilepath,
  entries,
  accounts,
  clientId,
  onEntryUpdate,
  onEntryConfirm,
  onAllEntriesConfirmed,
  onAccountsRefresh,
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
  const [checkedFields, setCheckedFields] = useState<Record<string, Record<string, boolean>>>(() => {
    const initial: Record<string, Record<string, boolean>> = {};
    entries.forEach((e) => {
      const allChecked = e.isConfirmed;
      initial[e.id] = Object.fromEntries(CLASSIFY_CHECK_FIELDS.map((f) => [f, allChecked]));
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

  const toggleFieldCheck = useCallback((entryId: string, field: string) => {
    setCheckedFields((prev) => ({
      ...prev,
      [entryId]: { ...prev[entryId], [field]: !prev[entryId]?.[field] },
    }));
  }, []);

  const currentChecks = checkedFields[currentEntry.id] || {};
  const allFieldsChecked = CLASSIFY_CHECK_FIELDS.every((f) => currentChecks[f]);
  const activeCheckField = confirmedEntries[currentEntry.id]
    ? null
    : CLASSIFY_CHECK_FIELDS.find((f) => !currentChecks[f]) ?? null;
  const checkedCount = CLASSIFY_CHECK_FIELDS.filter((f) => currentChecks[f]).length;

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

  /*
    いま見ている仕訳を確認し終えると、項目ごとの吹き出しが全て消える。
    未確認の仕訳が残っているのに何も指さない画面になってしまうため、
    最初の未確認の仕訳に誘導を出す。OCR確認画面と同じ作法。
  */
  const firstUnconfirmedEntry = entries.find((e) => !confirmedEntries[e.id]);
  const currentEntryForGuide = entries[currentEntryIndex];
  const showEntryGuide =
    !!currentEntryForGuide &&
    !!firstUnconfirmedEntry &&
    !!confirmedEntries[currentEntryForGuide.id] &&
    firstUnconfirmedEntry.id !== currentEntryForGuide.id;

  return (
    <div className="space-y-4">
      {/* エントリナビゲーション */}
      {entries.length > 1 && (
        <div
          className={cn(
            "flex items-center gap-2",
            /* 誘導はボタンの下に出るので、その分だけ余白を足す */
            showEntryGuide ? "mb-12" : "mb-4"
          )}
        >
          <span className="text-sm text-gray-600 mr-2">仕訳:</span>
          {entries.map((entry, index) => {
            const showNextEntryGuide = showEntryGuide && entry.id === firstUnconfirmedEntry!.id;

            return (
              <div key={entry.id} className="relative">
                <button
                  onClick={() => setCurrentEntryIndex(index)}
                  className={cn(
                    "w-10 h-10 rounded-lg text-sm font-medium transition-colors",
                    index === currentEntryIndex
                      ? "bg-teal-600 text-white"
                      : confirmedEntries[entry.id]
                        ? "bg-green-100 text-green-700 border border-green-300"
                        : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  )}
                >
                  {index + 1}
                </button>
                {showNextEntryGuide && (
                  <GuideBubble
                    arrow="top"
                    arrowAlign="start"
                    size="sm"
                    announce
                    className="absolute top-full mt-2 left-0"
                  >
                    この仕訳を確認しましょう ↑
                  </GuideBubble>
                )}
              </div>
            );
          })}
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
              /*
                **`#page=N` を付ける。** これが無いと、どの仕訳を選んでも
                1ページ目が表示される。3ページのPDFで2件目・3件目の仕訳を
                見ているのに、証憑は1ページ目のまま、という状態だった。

                key にページ番号を入れているのは、同じ src のまま fragment だけ
                変えても iframe が読み直さないため。
              */
              <iframe
                key={matchedPage?.pageNumber ?? 1}
                src={`/api/files?path=${encodeURIComponent(documentFilepath)}#page=${matchedPage?.pageNumber ?? 1}`}
                className="w-full border rounded"
                style={{ height: "600px" }}
                title={`PDF ページ ${matchedPage?.pageNumber ?? 1}`}
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
          <div className="bg-white border rounded-xl">
            <div className="bg-gray-50 px-4 py-3 border-b rounded-t-xl flex items-center justify-between">
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
                <div className="flex items-center gap-2">
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
                    className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">-- 選択してください --</option>
                    {/* AIが選んだコードがマスターにない場合も選択肢に表示 */}
                    {currentEntry.accountCode && !accounts.find((a) => a.code === currentEntry.accountCode) && (
                      <option value={currentEntry.accountCode}>
                        {currentEntry.accountName || currentEntry.accountCode}
                      </option>
                    )}
                    {CATEGORY_ORDER.map((category) => {
                      const categoryAccounts = accounts.filter((a) => a.category === category);
                      if (categoryAccounts.length === 0) return null;
                      return (
                        <optgroup key={category} label={category}>
                          {categoryAccounts.map((a) => (
                            <option key={a.code} value={a.code}>
                              {a.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                    {/* カテゴリ未分類の勘定科目 */}
                    {accounts
                      .filter((a) => !CATEGORY_ORDER.includes(a.category))
                      .map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                  <ClassifyCheckButton
                    checked={!!currentChecks.accountCode}
                    confirmed={isDisabled}
                    onClick={() => toggleFieldCheck(currentEntry.id, "accountCode")}
                    isGuideActive={activeCheckField === "accountCode"}
                    guideStep={checkedCount + 1}
                  />
                </div>
              </div>
              {/* 補助科目 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">補助科目</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SubAccountCombobox
                      subAccounts={subAccounts}
                      value={String(getFieldValue("subAccountCode"))}
                      valueName={String(getFieldValue("subAccountName"))}
                      onChange={(code, name) => {
                        handleFieldChange("subAccountCode", code);
                        handleFieldChange("subAccountName", name);
                      }}
                      accountId={selectedAccount?.id || ""}
                      clientId={clientId}
                      disabled={isDisabled}
                      onSubAccountAdded={onAccountsRefresh}
                    />
                  </div>
                  <ClassifyCheckButton
                    checked={!!currentChecks.subAccountCode}
                    confirmed={isDisabled}
                    onClick={() => toggleFieldCheck(currentEntry.id, "subAccountCode")}
                    isGuideActive={activeCheckField === "subAccountCode"}
                    guideStep={checkedCount + 1}
                  />
                </div>
              </div>
              {/* 税率区分 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">税率区分</label>
                <div className="flex items-center gap-2">
                  <select
                    value={String(getFieldValue("taxRate"))}
                    onChange={(e) => handleFieldChange("taxRate", e.target.value)}
                    disabled={isDisabled}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">-- 選択してください --</option>
                    {TAX_RATE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <ClassifyCheckButton
                    checked={!!currentChecks.taxRate}
                    confirmed={isDisabled}
                    onClick={() => toggleFieldCheck(currentEntry.id, "taxRate")}
                    isGuideActive={activeCheckField === "taxRate"}
                    guideStep={checkedCount + 1}
                  />
                </div>
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
            <div className="relative">
              <button
                onClick={() => handleConfirm(currentEntry.id)}
                disabled={isDisabled || savingEntries[currentEntry.id] || !allFieldsChecked}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50",
                  allFieldsChecked && !confirmedEntries[currentEntry.id]
                    ? "bg-teal-600 hover:bg-teal-700 ring-2 ring-teal-300 ring-offset-1 animate-pulse"
                    : "bg-teal-600 hover:bg-teal-700"
                )}
              >
                {savingEntries[currentEntry.id] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                確認完了
              </button>
              {allFieldsChecked && !confirmedEntries[currentEntry.id] && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap bg-teal-700 text-white text-xs rounded-md px-3 py-1.5 shadow-lg z-10 animate-bounce">
                  全項目チェック済み！確認完了を押してください
                  <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-teal-700" />
                </div>
              )}
            </div>
            {!confirmedEntries[currentEntry.id] && !allFieldsChecked && (
              <span className="text-xs text-amber-600">
                各項目を確認してチェックしてください
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClassifyCheckButton({
  checked,
  confirmed,
  onClick,
  isGuideActive = false,
  guideStep,
}: {
  checked: boolean;
  confirmed: boolean;
  onClick: () => void;
  isGuideActive?: boolean;
  guideStep?: number;
}) {
  if (confirmed) {
    return (
      <div className="flex items-center justify-center w-8 h-8 mt-0.5">
        <CircleCheck className="w-5 h-5 text-green-500" />
      </div>
    );
  }
  return (
    <div className="relative mt-0.5 shrink-0">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
          checked
            ? "bg-green-100 border-green-500 text-green-600 hover:bg-green-200"
            : isGuideActive
              ? "border-teal-400 text-teal-400 ring-2 ring-teal-200 ring-offset-1 animate-pulse hover:border-teal-500"
              : "border-gray-300 text-gray-300 hover:border-gray-400 hover:text-gray-400"
        )}
      >
        {checked && <Check className="w-4 h-4" />}
      </button>
      {isGuideActive && !checked && (
        <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-teal-600 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg z-10">
          <span className="font-bold">{guideStep}/{CLASSIFY_CHECK_FIELDS.length}</span>{" "}合っていたらチェック →
          <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-teal-600" />
        </div>
      )}
    </div>
  );
}
