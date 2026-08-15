"use client";

import { useState, useCallback } from "react";
import { Check, RotateCcw, Loader2, CircleCheck, Sparkles, RefreshCw, Pencil, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import GuideBubble from "@/components/GuideBubble";
import DateInput, { isValidDateValue } from "@/components/DateInput";
import Image from "next/image";

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

interface OCREditorProps {
  pages: Page[];
  documentFileType: string;
  documentFilepath: string;
  readOnly?: boolean;
  mode?: "first_check" | "double_check";
  onPageUpdate: (pageId: string, data: PageUpdateData) => Promise<void>;
  onPageConfirm: (pageId: string) => Promise<void>;
  onAllPagesConfirmed?: () => void;
}

export interface PageUpdateData {
  correctedText: string;
  date: string;
  registrationNumber: string;
  amount: string;
  tax: string;
  memo: string;
}

const CHECK_FIELDS = ["date", "registrationNumber", "amount", "tax"] as const;

export default function OCREditor({
  pages,
  documentFileType,
  documentFilepath,
  readOnly = false,
  mode = "first_check",
  onPageUpdate,
  onPageConfirm,
  onAllPagesConfirmed,
}: OCREditorProps) {
  const isDoubleCheck = mode === "double_check";
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    pages.forEach((p) => {
      initial[p.id] = p.correctedText || p.ocrText;
    });
    return initial;
  });
  const [editedFields, setEditedFields] = useState<Record<string, Omit<PageUpdateData, "correctedText">>>(() => {
    const initial: Record<string, Omit<PageUpdateData, "correctedText">> = {};
    pages.forEach((p) => {
      initial[p.id] = {
        date: p.date || "",
        registrationNumber: p.registrationNumber || "",
        amount: p.amount || "",
        tax: p.tax || "",
        memo: p.memo || "",
      };
    });
    return initial;
  });
  const [checkedFields, setCheckedFields] = useState<Record<string, Record<string, boolean>>>(() => {
    const initial: Record<string, Record<string, boolean>> = {};
    pages.forEach((p) => {
      // ダブルチェックモード: isDoubleChecked で判定（未チェックならリセット）
      const allChecked = isDoubleCheck ? !!p.isDoubleChecked : p.isConfirmed;
      initial[p.id] = Object.fromEntries(CHECK_FIELDS.map((f) => [f, allChecked]));
    });
    return initial;
  });

  const [savingPages, setSavingPages] = useState<Record<string, boolean>>({});
  const [rereadingFields, setRereadingFields] = useState<Record<string, boolean>>({});
  const [rereadErrors, setRereadErrors] = useState<Record<string, string>>({});
  const [rereadingAll, setRereadingAll] = useState<Record<string, boolean>>({});
  const [dateCalendarOpen, setDateCalendarOpen] = useState(false);
  const [confirmedPages, setConfirmedPages] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    pages.forEach((p) => {
      initial[p.id] = isDoubleCheck ? !!p.isDoubleChecked : p.isConfirmed;
    });
    return initial;
  });

  const currentPage = pages[currentPageIndex];

  if (!currentPage) {
    return (
      <div className="text-center py-12 text-gray-500">
        ページが見つかりません
      </div>
    );
  }

  const handleTextChange = (pageId: string, text: string) => {
    setEditedTexts((prev) => ({ ...prev, [pageId]: text }));
  };

  const handleFieldChange = (pageId: string, field: string, value: string) => {
    setEditedFields((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], [field]: value },
    }));
  };

  const getPageData = (pageId: string): PageUpdateData => ({
    correctedText: editedTexts[pageId] || "",
    ...(editedFields[pageId] || { date: "", registrationNumber: "", amount: "", tax: "", memo: "" }),
  });

  const handleSave = async (pageId: string) => {
    setSavingPages((prev) => ({ ...prev, [pageId]: true }));
    try {
      await onPageUpdate(pageId, getPageData(pageId));
    } finally {
      setSavingPages((prev) => ({ ...prev, [pageId]: false }));
    }
  };

  const handleConfirm = async (pageId: string) => {
    setSavingPages((prev) => ({ ...prev, [pageId]: true }));
    try {
      await onPageUpdate(pageId, getPageData(pageId));
      await onPageConfirm(pageId);
      let allDone = false;
      setConfirmedPages((prev) => {
        const updated = { ...prev, [pageId]: true };
        allDone = pages.every((p) => updated[p.id]);
        return updated;
      });
      if (allDone && onAllPagesConfirmed) {
        onAllPagesConfirmed();
      }
    } finally {
      setSavingPages((prev) => ({ ...prev, [pageId]: false }));
    }
  };

  const handleReset = (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (page) {
      setEditedTexts((prev) => ({ ...prev, [pageId]: page.ocrText }));
      setEditedFields((prev) => ({
        ...prev,
        [pageId]: {
          date: page.date || "",
          registrationNumber: page.registrationNumber || "",
          amount: page.amount || "",
          tax: page.tax || "",
          memo: page.memo || "",
        },
      }));
    }
  };

  const handleRereadField = useCallback(async (pageId: string, fieldName: string) => {
    const key = `${pageId}:${fieldName}`;
    setRereadingFields((prev) => ({ ...prev, [key]: true }));
    setRereadErrors((prev) => { const next = { ...prev }; delete next[pageId]; return next; });
    try {
      const res = await fetch("/api/ocr/reread-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, fieldName }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "再読み取りに失敗しました");
      }
      const { value, raw } = await res.json();
      if (value) {
        handleFieldChange(pageId, fieldName, value);
        setRereadErrors((prev) => { const next = { ...prev }; delete next[pageId]; return next; });
      } else {
        setRereadErrors((prev) => ({
          ...prev,
          [pageId]: `登録番号を検出できませんでした${raw ? `（AI応答: ${raw}）` : ""}`,
        }));
      }
    } catch (err) {
      setRereadErrors((prev) => ({
        ...prev,
        [pageId]: err instanceof Error ? err.message : "再読み取りに失敗しました",
      }));
    } finally {
      setRereadingFields((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const handleRereadAll = useCallback(async (pageId: string) => {
    setRereadingAll((prev) => ({ ...prev, [pageId]: true }));
    setRereadErrors((prev) => { const next = { ...prev }; delete next[pageId]; return next; });
    try {
      const res = await fetch("/api/ocr/reread-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "再読み取りに失敗しました");
      }
      const data = await res.json();
      setEditedFields((prev) => ({
        ...prev,
        [pageId]: {
          date: data.date || prev[pageId]?.date || "",
          registrationNumber: data.registrationNumber || prev[pageId]?.registrationNumber || "",
          amount: data.amount || prev[pageId]?.amount || "",
          tax: data.tax || prev[pageId]?.tax || "",
          memo: data.memo || prev[pageId]?.memo || "",
        },
      }));
      if (data.ocrText) {
        setEditedTexts((prev) => ({ ...prev, [pageId]: data.ocrText }));
      }
    } catch (err) {
      setRereadErrors((prev) => ({
        ...prev,
        [pageId]: err instanceof Error ? err.message : "再読み取りに失敗しました",
      }));
    } finally {
      setRereadingAll((prev) => ({ ...prev, [pageId]: false }));
    }
  }, []);

  const toggleFieldCheck = useCallback((pageId: string, field: string) => {
    setCheckedFields((prev) => ({
      ...prev,
      [pageId]: { ...prev[pageId], [field]: !prev[pageId]?.[field] },
    }));
  }, []);

  const currentPageChecks = checkedFields[currentPage.id] || {};
  const allFieldsChecked = CHECK_FIELDS.every((f) => currentPageChecks[f]);
  const checkedCount = CHECK_FIELDS.filter((f) => currentPageChecks[f]).length;

  const isPdf = documentFileType === "pdf";
  const fields = editedFields[currentPage.id] || { date: "", registrationNumber: "", amount: "", tax: "", memo: "" };
  const isDisabled = readOnly || confirmedPages[currentPage.id];

  // 上から順に最初の未チェックフィールドを特定
  const activeField = isDisabled
    ? null
    : CHECK_FIELDS.find((f) => !currentPageChecks[f]) ?? null;

  // activeField にバリデーションエラーがあるか判定
  const activeFieldHasAlert = (() => {
    if (!activeField) return false;
    switch (activeField) {
      case "date":
        return !fields.date || !isValidDateValue(fields.date);
      case "registrationNumber":
        return !!fields.registrationNumber && !/^T\d{13}$/.test(fields.registrationNumber);
      case "amount":
        return !fields.amount || fields.amount === "0";
      case "tax":
        return !fields.tax || fields.tax === "0";
      default:
        return false;
    }
  })();

  return (
    <div className="space-y-4">
      {/* ダブルチェックモードバナー */}
      {isDoubleCheck && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <Check className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <span className="text-sm font-medium text-amber-800">
            ダブルチェックモード — 各項目を再確認してください
          </span>
        </div>
      )}

      {/* ページナビゲーション */}
      {pages.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-600 mr-2">ページ:</span>
          {pages.map((page, index) => {
            /*
              いま見ているページを確認し終えると、項目ごとの吹き出しが全て消える。
              未確認のページが残っているのに何も指さない状態になるため、
              最初の未確認ページのボタンに誘導を出す。
            */
            const showNextPageGuide =
              confirmedPages[currentPage.id] &&
              !confirmedPages[page.id] &&
              page.id === pages.find((p) => !confirmedPages[p.id])?.id;

            return (
              <div key={page.id} className="relative">
                <button
                  onClick={() => setCurrentPageIndex(index)}
                  className={cn(
                    "w-10 h-10 rounded-lg text-sm font-medium transition-colors",
                    index === currentPageIndex
                      ? "bg-teal-600 text-white"
                      : confirmedPages[page.id]
                        ? "bg-green-100 text-green-700 border border-green-300"
                        : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                  )}
                >
                  {page.pageNumber}
                </button>
                {showNextPageGuide && (
                  <GuideBubble
                    arrow="left"
                    arrowAlign="center"
                    size="sm"
                    announce
                    className="absolute left-full ml-2 top-1/2 -translate-y-1/2"
                  >
                    このページも確認しましょう →
                  </GuideBubble>
                )}
              </div>
            );
          })}
          <span className="text-sm text-gray-500 ml-2">
            ({pages.filter((p) => confirmedPages[p.id]).length}/{pages.length} 確認済)
          </span>
        </div>
      )}

      {/* メインエディタ - 画像とテキストを並べて表示 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左側: 元画像 / PDF */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="text-sm font-medium text-gray-700">
              {isPdf ? "元PDF" : "元画像"} (ページ {currentPage.pageNumber})
            </h3>
          </div>
          <div className="p-4">
            {isPdf ? (
              <iframe
                src={`/api/files?path=${encodeURIComponent(documentFilepath)}`}
                className="w-full border rounded"
                style={{ height: "600px" }}
                title={`PDF ページ ${currentPage.pageNumber}`}
              />
            ) : (
              <div className="overflow-auto max-h-[600px]">
                <Image
                  src={`/api/files?path=${encodeURIComponent(currentPage.imagePath)}`}
                  alt={`ページ ${currentPage.pageNumber}`}
                  width={800}
                  height={1100}
                  className="w-full h-auto border rounded"
                  unoptimized
                />
              </div>
            )}
          </div>
        </div>

        {/* 右側: 構造化フィールド + OCRテキスト */}
        <div className="space-y-4">
          {/* 構造化フィールド */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">
                読み取り項目
              </h3>
              <div className="flex items-center gap-2">
                {!isDisabled && !isDoubleCheck && (
                  <button
                    type="button"
                    onClick={() => handleRereadAll(currentPage.id)}
                    disabled={rereadingAll[currentPage.id]}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
                  >
                    {rereadingAll[currentPage.id] ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    {rereadingAll[currentPage.id] ? "再読み取り中..." : "全項目を再読み取り"}
                  </button>
                )}
                {confirmedPages[currentPage.id] && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                    <Check className="w-3 h-3" />
                    確認済
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 space-y-3">
              <FieldRow
                label="日付"
                value={fields.date}
                placeholder="YYYY-MM-DD"
                disabled={isDisabled || !!currentPageChecks.date}
                onChange={(v) => handleFieldChange(currentPage.id, "date", v)}
                checked={!!currentPageChecks.date}
                onCheck={() => toggleFieldCheck(currentPage.id, "date")}
                showCheck={!readOnly}
                isGuideActive={activeField === "date" && !activeFieldHasAlert}
                guideStep={checkedCount + 1}
                inputType="date"
                onDateCalendarOpenChange={setDateCalendarOpen}
                isConfirmed={isDisabled && !!currentPageChecks.date}
                isDoubleCheck={isDoubleCheck}
                onCorrectionRequest={isDoubleCheck ? (v) => {
                  handleFieldChange(currentPage.id, "date", v);
                  if (!currentPageChecks.date) toggleFieldCheck(currentPage.id, "date");
                } : undefined}
                validationError={
                  !fields.date
                    ? "日付を入力してください"
                    : !isValidDateValue(fields.date)
                      ? "正しい日付形式（YYYY-MM-DD）で入力してください"
                      : undefined
                }
              />
              {activeField === "date" && activeFieldHasAlert && !dateCalendarOpen && (
                <div className="flex justify-center -mt-1">
                  <div className="relative bg-teal-600 text-white text-xs rounded-md px-3 py-1.5 shadow-lg">
                    日付が空欄です — ↑ クリックして選択
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full border-4 border-transparent border-b-teal-600" />
                  </div>
                </div>
              )}
              <FieldRow
                label="登録番号"
                value={fields.registrationNumber}
                placeholder="T0000000000000"
                disabled={isDisabled || !!currentPageChecks.registrationNumber}
                onChange={(v) => handleFieldChange(currentPage.id, "registrationNumber", v)}
                checked={!!currentPageChecks.registrationNumber}
                onCheck={() => toggleFieldCheck(currentPage.id, "registrationNumber")}
                showCheck={!readOnly}
                isGuideActive={activeField === "registrationNumber" && !activeFieldHasAlert}
                guideStep={checkedCount + 1}
                onReread={!readOnly && !isDoubleCheck ? () => handleRereadField(currentPage.id, "registrationNumber") : undefined}
                isRereading={!!rereadingFields[`${currentPage.id}:registrationNumber`]}
                emptyHint="空欄です — AIで再読み取りしてください"
                isConfirmed={isDisabled && !!currentPageChecks.registrationNumber}
                isDoubleCheck={isDoubleCheck}
                onCorrectionRequest={isDoubleCheck ? (v) => {
                  handleFieldChange(currentPage.id, "registrationNumber", v);
                  if (!currentPageChecks.registrationNumber) toggleFieldCheck(currentPage.id, "registrationNumber");
                } : undefined}
                validationError={
                  !fields.registrationNumber
                    ? "登録番号を入力してください"
                    : !/^T\d{13}$/.test(fields.registrationNumber)
                      ? "T＋13桁の数字で入力してください"
                      : undefined
                }
              />
              {activeField === "registrationNumber" && activeFieldHasAlert && (() => {
                const v = fields.registrationNumber;
                const startsWithT = v.startsWith("T");
                const digitPart = startsWithT ? v.slice(1) : v;
                const digitCount = (digitPart.match(/\d/g) || []).length;
                const hasNonDigit = startsWithT && /[^\d]/.test(digitPart);
                let message = "";
                if (!startsWithT) {
                  message = "先頭に「T」が必要です";
                } else if (hasNonDigit) {
                  message = "T以降は数字のみです";
                } else if (digitCount < 13) {
                  message = `数字が${digitCount}桁です（あと${13 - digitCount}桁）`;
                } else if (digitCount > 13) {
                  message = `数字が${digitCount}桁です（${digitCount - 13}桁多い）`;
                }
                return (
                  <div className="flex justify-center -mt-1">
                    <div className="relative bg-teal-600 text-white text-xs rounded-md px-3 py-1.5 shadow-lg">
                      ⚠ T＋数字13桁{message && ` — ${message}`}
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full border-4 border-transparent border-b-teal-600" />
                    </div>
                  </div>
                );
              })()}
              <FieldRow
                label="金額（税込）"
                value={fields.amount}
                placeholder="0"
                disabled={isDisabled || !!currentPageChecks.amount}
                onChange={(v) => handleFieldChange(currentPage.id, "amount", v)}
                checked={!!currentPageChecks.amount}
                onCheck={() => toggleFieldCheck(currentPage.id, "amount")}
                showCheck={!readOnly}
                isGuideActive={activeField === "amount" && !activeFieldHasAlert}
                guideStep={checkedCount + 1}
                isConfirmed={isDisabled && !!currentPageChecks.amount}
                isDoubleCheck={isDoubleCheck}
                onCorrectionRequest={isDoubleCheck ? (v) => {
                  handleFieldChange(currentPage.id, "amount", v);
                  if (!currentPageChecks.amount) toggleFieldCheck(currentPage.id, "amount");
                } : undefined}
              />
              {activeField === "amount" && activeFieldHasAlert && (
                <div className="flex justify-center -mt-1">
                  <div className="relative bg-teal-600 text-white text-xs rounded-md px-3 py-1.5 shadow-lg">
                    ⚠ 金額が未入力です
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full border-4 border-transparent border-b-teal-600" />
                  </div>
                </div>
              )}
              <FieldRow
                label="消費税"
                value={fields.tax}
                placeholder="0"
                disabled={isDisabled || !!currentPageChecks.tax}
                onChange={(v) => handleFieldChange(currentPage.id, "tax", v)}
                checked={!!currentPageChecks.tax}
                onCheck={() => toggleFieldCheck(currentPage.id, "tax")}
                showCheck={!readOnly}
                isGuideActive={activeField === "tax" && !activeFieldHasAlert}
                guideStep={checkedCount + 1}
                isConfirmed={isDisabled && !!currentPageChecks.tax}
                isDoubleCheck={isDoubleCheck}
                onCorrectionRequest={isDoubleCheck ? (v) => {
                  handleFieldChange(currentPage.id, "tax", v);
                  if (!currentPageChecks.tax) toggleFieldCheck(currentPage.id, "tax");
                } : undefined}
              />
              {activeField === "tax" && activeFieldHasAlert && (
                <div className="flex justify-center -mt-1">
                  <div className="relative bg-teal-600 text-white text-xs rounded-md px-3 py-1.5 shadow-lg">
                    ⚠ 消費税が未入力です
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full border-4 border-transparent border-b-teal-600" />
                  </div>
                </div>
              )}
              {rereadErrors[currentPage.id] && (
                <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {rereadErrors[currentPage.id]}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">メモ（書かなくても大丈夫です）</label>
                <textarea
                  value={fields.memo}
                  onChange={(e) => handleFieldChange(currentPage.id, "memo", e.target.value)}
                  disabled={isDisabled || isDoubleCheck}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-50 disabled:text-gray-500 resize-none"
                  placeholder="お店の名前や、買ったものなど"
                />
              </div>
            </div>
          </div>

          {/* OCRテキスト編集 */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b">
              <h3 className="text-sm font-medium text-gray-700">
                読み取った文字（ぜんぶ）
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                ここは直さなくてかまいません。上の4つが合っていれば大丈夫です。
              </p>
            </div>
            <div className="p-4">
              <textarea
                value={editedTexts[currentPage.id] || ""}
                onChange={(e) => handleTextChange(currentPage.id, e.target.value)}
                className="w-full h-[200px] p-3 border rounded-lg text-sm font-mono resize-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="OCR結果がここに表示されます..."
                disabled={isDisabled}
              />
            </div>
          </div>

          {/* アクションボタン */}
          {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleReset(currentPage.id)}
              disabled={isDisabled || savingPages[currentPage.id]}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              元に戻す
            </button>
            <button
              onClick={() => handleSave(currentPage.id)}
              disabled={isDisabled || savingPages[currentPage.id]}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {savingPages[currentPage.id] ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              保存
            </button>
            <div className="relative">
              <button
                onClick={() => handleConfirm(currentPage.id)}
                disabled={isDisabled || savingPages[currentPage.id] || !allFieldsChecked}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50",
                  allFieldsChecked && !confirmedPages[currentPage.id]
                    ? "bg-teal-600 hover:bg-teal-700 ring-2 ring-teal-300 ring-offset-1 animate-pulse"
                    : "bg-teal-600 hover:bg-teal-700"
                )}
              >
                {savingPages[currentPage.id] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {isDoubleCheck ? "ダブルチェック完了" : "確認完了"}
              </button>
              {allFieldsChecked && !confirmedPages[currentPage.id] && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 whitespace-nowrap bg-teal-700 text-white text-xs rounded-md px-3 py-1.5 shadow-lg z-10 animate-bounce">
                  全項目チェック済み！{isDoubleCheck ? "ダブルチェック完了" : "確認完了"}を押してください
                  <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-teal-700" />
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CheckButton({
  checked,
  confirmed,
  onClick,
  isGuideActive = false,
  guideStep,
  validationError,
}: {
  checked: boolean;
  confirmed: boolean;
  onClick: () => void;
  isGuideActive?: boolean;
  guideStep?: number;
  validationError?: string;
}) {
  const [showError, setShowError] = useState(false);

  if (confirmed) {
    return (
      <div className="flex items-center justify-center w-8 h-8 mt-0.5">
        <CircleCheck className="w-5 h-5 text-green-500" />
      </div>
    );
  }

  const handleClick = () => {
    if (validationError) {
      setShowError(true);
      setTimeout(() => setShowError(false), 2500);
      return;
    }
    onClick();
  };

  return (
    <div className="relative mt-0.5 shrink-0">
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
          checked
            ? "bg-green-100 border-green-500 text-green-600 hover:bg-green-200"
            : validationError
              ? "border-gray-200 text-gray-200 cursor-not-allowed"
              : isGuideActive
                ? "border-teal-400 text-teal-400 ring-2 ring-teal-200 ring-offset-1 animate-pulse hover:border-teal-500"
                : "border-gray-300 text-gray-300 hover:border-gray-400 hover:text-gray-400"
        )}
      >
        {checked && <Check className="w-4 h-4" />}
      </button>
      {showError && validationError && (
        <div className="absolute right-0 bottom-full mb-2 whitespace-nowrap bg-red-500 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg z-10 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {validationError}
          <div className="absolute right-2.5 top-full border-4 border-transparent border-t-red-500" />
        </div>
      )}
      {!showError && isGuideActive && !checked && !validationError && (
        <div className="absolute right-0 bottom-full mb-2 whitespace-nowrap bg-teal-600 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg z-10">
          <span className="font-bold">{guideStep}/{CHECK_FIELDS.length}</span>{" "}合っていたらチェック →
          <div className="absolute right-2.5 top-full border-4 border-transparent border-t-teal-600" />
        </div>
      )}
    </div>
  );
}

function FieldRow({
  label,
  value,
  placeholder,
  disabled,
  onChange,
  checked,
  onCheck,
  showCheck,
  isGuideActive = false,
  guideStep,
  onReread,
  isRereading = false,
  emptyHint,
  inputType = "text",
  validationError,
  onDateCalendarOpenChange,
  isConfirmed = false,
  isDoubleCheck = false,
  onCorrectionRequest,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
  checked: boolean;
  onCheck: () => void;
  showCheck: boolean;
  isGuideActive?: boolean;
  guideStep?: number;
  onReread?: () => void;
  isRereading?: boolean;
  emptyHint?: string;
  inputType?: "text" | "date";
  validationError?: string;
  onDateCalendarOpenChange?: (open: boolean) => void;
  isConfirmed?: boolean;
  isDoubleCheck?: boolean;
  onCorrectionRequest?: (correctedValue: string) => void;
}) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [correctionValue, setCorrectionValue] = useState("");
  const showEmptyHint = emptyHint && !value && onReread && !disabled && !isRereading;

  // ダブルチェックモード: フィールドは常に disabled
  const fieldDisabled = isDoubleCheck ? true : disabled;

  const handleCorrectionSubmit = () => {
    if (!correctionValue.trim() || !onCorrectionRequest) return;
    onCorrectionRequest(correctionValue.trim());
    setShowCorrection(false);
    setCorrectionValue("");
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        {inputType === "date" ? (
          <DateInput
            value={value}
            onChange={onChange}
            disabled={fieldDisabled}
            placeholder={placeholder}
            onOpenChange={onDateCalendarOpenChange}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={fieldDisabled}
            className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 disabled:bg-gray-50 disabled:text-gray-500"
            placeholder={placeholder}
          />
        )}
        {onReread && !disabled && (
          <div className="relative group">
            <button
              type="button"
              onClick={onReread}
              disabled={isRereading}
              className="flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              {isRereading ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
            </button>
            {!isRereading && !showEmptyHint && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap bg-gray-800 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                AIで再読み取り
              </div>
            )}
            {showEmptyHint && (
              <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-amber-500 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg z-10 animate-pulse cursor-pointer" onClick={onReread}>
                {emptyHint} →
                <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-amber-500" />
              </div>
            )}
          </div>
        )}
        {/* ダブルチェック: 修正依頼ボタン（常時ラベル表示） */}
        {isDoubleCheck && !checked && !isConfirmed && onCorrectionRequest && (
          <button
            type="button"
            onClick={() => {
              setShowCorrection(!showCorrection);
              setCorrectionValue(value);
            }}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0",
              showCorrection
                ? "bg-amber-200 text-amber-800 ring-1 ring-amber-300"
                : "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100"
            )}
          >
            <Pencil className="w-3 h-3" />
            修正依頼
          </button>
        )}
        {showCheck && (
          <CheckButton
            checked={checked}
            confirmed={isConfirmed}
            onClick={onCheck}
            isGuideActive={isGuideActive}
            guideStep={guideStep}
            validationError={isDoubleCheck ? undefined : validationError}
          />
        )}
      </div>
      {/* ダブルチェック: 修正フォーム */}
      {showCorrection && isDoubleCheck && onCorrectionRequest && (
        <div className="mt-2 ml-1 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span className="text-xs font-medium text-amber-700 shrink-0">修正値:</span>
          <input
            type={inputType === "date" ? "date" : "text"}
            value={correctionValue}
            onChange={(e) => setCorrectionValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCorrectionSubmit();
            }}
            className="flex-1 px-2 py-1 border border-amber-300 rounded text-sm focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
            placeholder={`正しい${label}を入力`}
            autoFocus
          />
          <button
            type="button"
            onClick={handleCorrectionSubmit}
            disabled={!correctionValue.trim()}
            className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors disabled:opacity-50"
          >
            <Send className="w-3 h-3" />
            送信
          </button>
        </div>
      )}
    </div>
  );
}
