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
}

interface OCREditorProps {
  pages: Page[];
  onPageUpdate: (pageId: string, correctedText: string) => Promise<void>;
  onPageConfirm: (pageId: string) => Promise<void>;
}

export default function OCREditor({ pages, onPageUpdate, onPageConfirm }: OCREditorProps) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    pages.forEach((p) => {
      initial[p.id] = p.correctedText || p.ocrText;
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

  const handleSave = async (pageId: string) => {
    setSavingPages((prev) => ({ ...prev, [pageId]: true }));
    try {
      await onPageUpdate(pageId, editedTexts[pageId]);
    } finally {
      setSavingPages((prev) => ({ ...prev, [pageId]: false }));
    }
  };

  const handleConfirm = async (pageId: string) => {
    setSavingPages((prev) => ({ ...prev, [pageId]: true }));
    try {
      await onPageUpdate(pageId, editedTexts[pageId]);
      await onPageConfirm(pageId);
      setConfirmedPages((prev) => ({ ...prev, [pageId]: true }));
    } finally {
      setSavingPages((prev) => ({ ...prev, [pageId]: false }));
    }
  };

  const handleReset = (pageId: string) => {
    const page = pages.find((p) => p.id === pageId);
    if (page) {
      setEditedTexts((prev) => ({ ...prev, [pageId]: page.ocrText }));
    }
  };

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
        {/* 左側: 元画像 */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="text-sm font-medium text-gray-700">
              元画像 (ページ {currentPage.pageNumber})
            </h3>
          </div>
          <div className="p-4 overflow-auto max-h-[600px]">
            <Image
              src={currentPage.imagePath}
              alt={`ページ ${currentPage.pageNumber}`}
              width={800}
              height={1100}
              className="w-full h-auto border rounded"
              unoptimized
            />
          </div>
        </div>

        {/* 右側: OCRテキスト編集 */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              OCR読み取り結果
            </h3>
            {confirmedPages[currentPage.id] && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                <Check className="w-3 h-3" />
                確認済
              </span>
            )}
          </div>
          <div className="p-4">
            <textarea
              value={editedTexts[currentPage.id] || ""}
              onChange={(e) => handleTextChange(currentPage.id, e.target.value)}
              className="w-full h-[480px] p-3 border rounded-lg text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="OCR結果がここに表示されます..."
              disabled={confirmedPages[currentPage.id]}
            />
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => handleReset(currentPage.id)}
                disabled={confirmedPages[currentPage.id] || savingPages[currentPage.id]}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                元に戻す
              </button>
              <button
                onClick={() => handleSave(currentPage.id)}
                disabled={confirmedPages[currentPage.id] || savingPages[currentPage.id]}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700 disabled:opacity-50"
              >
                {savingPages[currentPage.id] ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                保存
              </button>
              <button
                onClick={() => handleConfirm(currentPage.id)}
                disabled={confirmedPages[currentPage.id] || savingPages[currentPage.id]}
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
    </div>
  );
}
