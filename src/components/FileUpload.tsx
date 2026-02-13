"use client";

import { useState, useCallback } from "react";
import {
  Upload,
  File,
  Image as ImageIcon,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
];

const ACCEPTED_EXTENSIONS = ".pdf,image/*";

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const ext = file.name.toLowerCase().split(".").pop();
  return ext === "heic" || ext === "heif";
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  const ext = file.name.toLowerCase().split(".").pop();
  return ext === "heic" || ext === "heif";
}

type FileStatus = "pending" | "uploading" | "uploaded" | "ocr_processing" | "ocr_complete" | "error";

interface FileItem {
  file: File;
  status: FileStatus;
  documentId?: string;
  error?: string;
}

interface FileUploadProps {
  /** 一括アップロード完了コールバック（ドキュメントIDの配列を返す） */
  onBulkUploadComplete?: (documentIds: string[]) => void;
  /** 単体アップロード完了コールバック（後方互換） */
  onUploadComplete?: (documentId: string) => void;
}

export default function FileUpload({
  onBulkUploadComplete,
  onUploadComplete,
}: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    setError(null);
    const validFiles: FileItem[] = [];
    const invalid: string[] = [];

    Array.from(newFiles).forEach((f) => {
      if (isAcceptedFile(f)) {
        validFiles.push({ file: f, status: "pending" });
      } else {
        invalid.push(f.name);
      }
    });

    if (invalid.length > 0) {
      setError(`対応していないファイル: ${invalid.join(", ")}`);
    }
    if (validFiles.length > 0) {
      setFiles((prev) => [...prev, ...validFiles]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(e.target.files);
      }
      // 同じファイルを再選択できるようにリセット
      e.target.value = "";
    },
    [addFiles]
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** 1ファイルをアップロード */
  const uploadOne = async (item: FileItem): Promise<string> => {
    const formData = new FormData();
    formData.append("file", item.file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "アップロードに失敗しました");
    return data.document.id;
  };

  /** 1ファイルのOCRを実行 */
  const runOCR = async (documentId: string): Promise<void> => {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "OCR処理に失敗しました");
  };

  const updateFileStatus = (
    index: number,
    updates: Partial<FileItem>
  ) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  /** 一括アップロード → 順次OCR */
  const handleBulkProcess = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setError(null);

    const documentIds: string[] = [];

    // Step 1: 全ファイルをアップロード
    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== "pending") continue;
      updateFileStatus(i, { status: "uploading" });
      try {
        const docId = await uploadOne(files[i]);
        documentIds.push(docId);
        updateFileStatus(i, { status: "uploaded", documentId: docId });
      } catch (err) {
        updateFileStatus(i, {
          status: "error",
          error: err instanceof Error ? err.message : "アップロード失敗",
        });
      }
    }

    // Step 2: アップロード成功したファイルのOCRを順次実行
    for (let i = 0; i < files.length; i++) {
      // 最新のstateを取得するためsetFilesのコールバックを利用
      const currentFile = await new Promise<FileItem>((resolve) => {
        setFiles((prev) => {
          resolve(prev[i]);
          return prev;
        });
      });

      if (currentFile.status !== "uploaded" || !currentFile.documentId) continue;

      updateFileStatus(i, { status: "ocr_processing" });
      try {
        await runOCR(currentFile.documentId);
        updateFileStatus(i, { status: "ocr_complete" });
      } catch (err) {
        updateFileStatus(i, {
          status: "error",
          error: err instanceof Error ? err.message : "OCR失敗",
        });
      }
    }

    setIsProcessing(false);

    // コールバック
    if (documentIds.length === 1 && onUploadComplete) {
      onUploadComplete(documentIds[0]);
    }
    if (onBulkUploadComplete && documentIds.length > 0) {
      onBulkUploadComplete(documentIds);
    }
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter(
    (f) => f.status === "ocr_complete"
  ).length;
  const errorCount = files.filter((f) => f.status === "error").length;

  const statusIcon = (status: FileStatus) => {
    switch (status) {
      case "pending":
        return null;
      case "uploading":
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case "uploaded":
        return <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />;
      case "ocr_processing":
        return <Loader2 className="w-4 h-4 animate-spin text-orange-500" />;
      case "ocr_complete":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const statusLabel = (status: FileStatus) => {
    switch (status) {
      case "pending":
        return "待機中";
      case "uploading":
        return "アップロード中...";
      case "uploaded":
        return "OCR待ち";
      case "ocr_processing":
        return "OCR処理中...";
      case "ocr_complete":
        return "完了";
      case "error":
        return "エラー";
    }
  };

  return (
    <div className="space-y-4">
      {/* ドロップゾーン */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer",
          isDragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-gray-400",
          isProcessing && "pointer-events-none opacity-60"
        )}
        onClick={() =>
          !isProcessing &&
          document.getElementById("file-input-multi")?.click()
        }
      >
        <input
          id="file-input-multi"
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-700 mb-1">
          ファイルをドラッグ&ドロップ（複数可）
        </p>
        <p className="text-sm text-gray-500">
          またはクリックしてファイルを選択（PDF, JPEG, PNG, HEIC 等）
        </p>
      </div>

      {/* ファイルリスト */}
      {files.length > 0 && (
        <div className="bg-white border rounded-lg divide-y">
          {files.map((item, idx) => (
            <div
              key={`${item.file.name}-${idx}`}
              className="flex items-center gap-3 px-4 py-3"
            >
              {isImageFile(item.file) ? (
                <ImageIcon className="w-5 h-5 text-blue-500 flex-shrink-0" />
              ) : (
                <File className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {(item.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs flex-shrink-0">
                {statusIcon(item.status)}
                <span
                  className={cn(
                    "whitespace-nowrap",
                    item.status === "error"
                      ? "text-red-600"
                      : item.status === "ocr_complete"
                      ? "text-green-600"
                      : "text-gray-500"
                  )}
                >
                  {statusLabel(item.status)}
                </span>
              </div>
              {item.status === "pending" && !isProcessing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(idx);
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {/* エラー詳細 */}
          {files
            .filter((f) => f.status === "error" && f.error)
            .map((f, i) => (
              <div
                key={`error-${i}`}
                className="px-4 py-2 bg-red-50 text-xs text-red-600"
              >
                {f.file.name}: {f.error}
              </div>
            ))}
        </div>
      )}

      {/* アクションバー */}
      {files.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {isProcessing ? (
              <span>
                処理中... ({doneCount}/{files.length} 完了
                {errorCount > 0 && `、${errorCount} エラー`})
              </span>
            ) : (
              <span>
                {files.length} ファイル選択済み
                {doneCount > 0 && ` (${doneCount} 完了)`}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {!isProcessing && pendingCount > 0 && (
              <>
                <button
                  onClick={() => setFiles([])}
                  className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
                >
                  すべてクリア
                </button>
                <button
                  onClick={handleBulkProcess}
                  className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  アップロード &amp; OCR実行 ({pendingCount}件)
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>
        </div>
      )}
    </div>
  );
}
