"use client";

import { useState } from "react";
import { Check, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

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

interface OCREditorProps {
  pages: Page[];
  documentFileType: string;
  documentFilepath: string;
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

export default function OCREditor({
  pages,
  documentFileType,
  documentFilepath,
  onPageUpdate,
  onPageConfirm,
  onAllPagesConfirmed,
}: OCREditorProps) {
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
  const [savingPages, setSavingPages] = useState<Record<string, boolean>>({});
  const [confirmedPages, setConfirmedPages] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    pages.forEach((p) => {
      initial[p.id] = p.isConfirmed;
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

  const isPdf = documentFileType === "pdf";
  const fields = editedFields[currentPage.id] || { date: "", registrationNumber: "", amount: "", tax: "", memo: "" };
  const isDisabled = confirmedPages[currentPage.id];

  return (
    <div className="space-y-4">
      {/* ページナビゲーション */}
      {pages.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm text-gray-600 mr-2">ページ:</span>
          {pages.map((page, index) => (
            <button
              key={page.id}
              onClick={() => setCurrentPageIndex(index)}
              className={cn(
                "w-10 h-10 rounded-lg text-sm font-medium transition-colors",
                index === currentPageIndex
                  ? "bg-blue-600 text-white"
                  : confirmedPages[page.id]
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              )}
            >
              {page.pageNumber}
            </button>
          ))}
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
              {confirmedPages[currentPage.id] && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                  <Check className="w-3 h-3" />
                  確認済
                </span>
              )}
            </div>
            <div className="p-4 space-y-3">
              <FieldRow
                label="日付"
                value={fields.date}
                placeholder="YYYY-MM-DD"
                disabled={isDisabled}
                onChange={(v) => handleFieldChange(currentPage.id, "date", v)}
              />
              <FieldRow
                label="登録番号"
                value={fields.registrationNumber}
                placeholder="T0000000000000"
                disabled={isDisabled}
                onChange={(v) => handleFieldChange(currentPage.id, "registrationNumber", v)}
              />
              <FieldRow
                label="金額（税込）"
                value={fields.amount}
                placeholder="0"
                disabled={isDisabled}
                onChange={(v) => handleFieldChange(currentPage.id, "amount", v)}
              />
              <FieldRow
                label="消費税"
                value={fields.tax}
                placeholder="0"
                disabled={isDisabled}
                onChange={(v) => handleFieldChange(currentPage.id, "tax", v)}
              />
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">メモ</label>
                <textarea
                  value={fields.memo}
                  onChange={(e) => handleFieldChange(currentPage.id, "memo", e.target.value)}
                  disabled={isDisabled}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 resize-none"
                  placeholder="取引先名・品目など"
                />
              </div>
            </div>
          </div>

          {/* OCRテキスト編集 */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b">
              <h3 className="text-sm font-medium text-gray-700">
                OCR読み取りテキスト（全文）
              </h3>
            </div>
            <div className="p-4">
              <textarea
                value={editedTexts[currentPage.id] || ""}
                onChange={(e) => handleTextChange(currentPage.id, e.target.value)}
                className="w-full h-[200px] p-3 border rounded-lg text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="OCR結果がここに表示されます..."
                disabled={isDisabled}
              />
            </div>
          </div>

          {/* アクションボタン */}
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
            <button
              onClick={() => handleConfirm(currentPage.id)}
              disabled={isDisabled || savingPages[currentPage.id]}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {savingPages[currentPage.id] ? (
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

function FieldRow({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
        placeholder={placeholder}
      />
    </div>
  );
}
