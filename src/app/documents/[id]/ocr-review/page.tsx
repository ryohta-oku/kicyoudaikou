"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Play, FileText } from "lucide-react";
import Image from "next/image";
import Stepper, { WORKFLOW_STEPS } from "@/components/Stepper";
import OCREditor, { type PageUpdateData } from "@/components/OCREditor";

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

interface Document {
  id: string;
  filename: string;
  filepath: string;
  fileType: string;
  status: string;
  pages: Page[];
}

export default function OCRReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocument = async () => {
    try {
      const res = await fetch(`/api/documents/${id}`);
      const data = await res.json();
      if (data.document) {
        setDocument(data.document);
      } else if (data.code) {
        setError(`[${data.code}] ${data.error}${data.detail ? `\n詳細: ${data.detail}` : ""}`);
      }
    } catch {
      setError("ドキュメントの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocument();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ページが無い場合は自動でOCRを開始（スタック状態のocr_processingも含む）
  useEffect(() => {
    if (document && document.pages.length === 0 &&
        (document.status === "uploaded" || document.status === "ocr_processing") &&
        !ocrProcessing) {
      startOCR();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document]);

  const startOCR = async () => {
    setOcrProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });

      if (!res.ok) {
        const data = await res.json();
        const code = data.code ? `[${data.code}] ` : "";
        const detail = data.detail ? `\n詳細: ${data.detail}` : "";
        throw new Error(`${code}${data.error || "OCR処理に失敗しました"}${detail}`);
      }

      await fetchDocument();
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR処理に失敗しました");
    } finally {
      setOcrProcessing(false);
    }
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">ドキュメントが見つかりません</p>
        <Link href="/" className="text-blue-600 hover:underline mt-4 inline-block">
          ダッシュボードに戻る
        </Link>
      </div>
    );
  }

  const hasPages = document.pages.length > 0;
  const allPagesConfirmed = hasPages && document.pages.every((p) => p.isConfirmed);

  return (
    <div className="space-y-6">
      <Stepper steps={WORKFLOW_STEPS} currentStep="ocr" />

      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">OCR確認・修正</h1>
            <p className="text-sm text-gray-500">{document.filename}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!hasPages && (
            <button
              onClick={startOCR}
              disabled={ocrProcessing}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:bg-gray-400"
            >
              {ocrProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  OCR処理中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  OCR処理を開始
                </>
              )}
            </button>
          )}
          {allPagesConfirmed && (
            <button
              onClick={() => router.push(`/documents/${id}/classify`)}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              次へ: AI仕訳分類
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {ocrProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-blue-700 font-medium">OCR処理を実行中です...</p>
          <p className="text-sm text-blue-600 mt-1">
            PDFの各ページを画像に変換し、テキストを読み取っています
          </p>
        </div>
      )}

      {hasPages && !ocrProcessing && (
        <OCREditor
          pages={document.pages}
          documentFileType={document.fileType}
          documentFilepath={document.filepath}
          onPageUpdate={handlePageUpdate}
          onPageConfirm={handlePageConfirm}
        />
      )}

      {!hasPages && !ocrProcessing && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
            <Play className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-700">
              OCR処理を自動的に開始しています...
            </p>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                アップロードファイル プレビュー
              </h3>
            </div>
            <div className="p-4">
              {document.fileType === "pdf" ? (
                <iframe
                  src={`/api/files?path=${encodeURIComponent(document.filepath)}`}
                  className="w-full border rounded"
                  style={{ height: "700px" }}
                  title="PDFプレビュー"
                />
              ) : (
                <Image
                  src={`/api/files?path=${encodeURIComponent(document.filepath)}`}
                  alt={document.filename}
                  width={800}
                  height={1100}
                  className="w-full h-auto border rounded"
                  unoptimized
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
