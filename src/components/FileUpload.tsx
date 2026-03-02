"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Upload,
  File,
  Image as ImageIcon,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FolderPlus,
  Send,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setSelectedClientId } from "@/lib/client";
import ClientSelector from "@/components/ClientSelector";

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

type FileStatus = "pending" | "uploading" | "uploaded" | "error";

interface FileItem {
  file: File;
  status: FileStatus;
  documentId?: string;
  error?: string;
}

interface FileUploadProps {
  /** 一括アップロード完了コールバック（フォルダIDとドキュメントIDの配列を返す） */
  onBulkUploadComplete?: (folderId: string, documentIds: string[]) => void;
  /** 単体アップロード完了コールバック（後方互換） */
  onUploadComplete?: (documentId: string) => void;
}

export default function FileUpload({
  onBulkUploadComplete,
  onUploadComplete,
}: FileUploadProps) {
  const { data: session } = useSession();
  const [isDragOver, setIsDragOver] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [clientConfirmed, setClientConfirmed] = useState(false);
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    if (!clientConfirmed) return;
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
  }, [clientConfirmed]);

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

  /** フォルダを作成 */
  const createFolder = async (name: string): Promise<string> => {
    const creator = session?.user?.name || "";
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, creator, clientId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "フォルダの作成に失敗しました");
    }
    return data.folder.id;
  };

  /** 1ファイルをアップロード */
  const uploadOne = async (item: FileItem, folderId: string): Promise<string> => {
    const formData = new FormData();
    formData.append("file", item.file);
    formData.append("folderId", folderId);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) {
      const detail = data.detail ? ` (${data.detail})` : "";
      throw new Error(`${data.error || "アップロードに失敗しました"}${detail}`);
    }
    return data.document.id;
  };

  const updateFileStatus = (
    index: number,
    updates: Partial<FileItem>
  ) => {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  /** 一括アップロード（OCRはフォルダ詳細ページで自動実行） */
  const handleBulkProcess = async () => {
    if (files.length === 0) return;
    if (!clientId || !clientConfirmed) return;

    // フォルダ名が未入力の場合、日時ベースのデフォルト名を使用
    const name = folderName.trim() || `アップロード ${new Date().toLocaleString("ja-JP")}`;

    setIsProcessing(true);
    setError(null);

    const documentIds: string[] = [];
    let folderId: string | null = null;

    try {
      // Step 0: フォルダを作成
      folderId = await createFolder(name);

      // Step 1: 全ファイルをアップロード
      for (let i = 0; i < files.length; i++) {
        if (files[i].status !== "pending") continue;
        updateFileStatus(i, { status: "uploading" });
        try {
          const docId = await uploadOne(files[i], folderId);
          documentIds.push(docId);
          updateFileStatus(i, { status: "uploaded", documentId: docId });
        } catch (err) {
          updateFileStatus(i, {
            status: "error",
            error: err instanceof Error ? err.message : "アップロード失敗",
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "処理に失敗しました");
    }

    setIsProcessing(false);

    // コールバック（フォルダページへの遷移をトリガー）
    if (folderId && documentIds.length > 0) {
      if (documentIds.length === 1 && onUploadComplete) {
        onUploadComplete(documentIds[0]);
      }
      if (onBulkUploadComplete) {
        onBulkUploadComplete(folderId, documentIds);
      }
    }
  };

  const hasPendingFiles = files.some((f) => f.status === "pending");

  const doneCount = files.filter(
    (f) => f.status === "uploaded"
  ).length;
  const errorCount = files.filter((f) => f.status === "error").length;

  const statusIcon = (status: FileStatus) => {
    switch (status) {
      case "pending":
        return null;
      case "uploading":
        return <Loader2 className="w-4 h-4 animate-spin text-teal-500" />;
      case "uploaded":
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
        return "完了";
      case "error":
        return "エラー";
    }
  };

  return (
    <div className="space-y-4">
      {/* フォルダ名入力 */}
      <div className="flex items-center gap-3">
        <FolderPlus className="w-5 h-5 text-yellow-500 flex-shrink-0" />
        <input
          type="text"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          placeholder="フォルダ名を入力（空欄の場合は日時で自動生成）"
          disabled={isProcessing}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100"
        />
      </div>

      {/* 得意先セレクター */}
      <div className="relative flex items-center gap-3">
        <Building2 className="w-5 h-5 text-teal-500 flex-shrink-0" />
        <ClientSelector
          selectedId={clientId}
          onSelect={(id, name) => {
            const changed = id !== clientId;
            setClientId(id);
            setClientName(name || "");
            setSelectedClientId(id);
            if (changed) {
              setClientConfirmed(false);
              setFiles([]);
            }
          }}
          variant="form"
          autoSelect={false}
          className="flex-1"
        />
        {/* Step 1: 得意先未選択 → 吹き出しナビ */}
        {!clientId && (
          <div className="absolute top-full left-8 mt-2 z-10">
            <div className="relative bg-amber-500 text-white text-sm font-medium rounded-full px-4 py-2 shadow-lg animate-bounce whitespace-nowrap">
              ↑ まず得意先を選んでください
              <div className="absolute bottom-full left-6 border-8 border-transparent border-b-amber-500" />
            </div>
          </div>
        )}
      </div>

      {/* 得意先確認チェック */}
      {clientId && clientName && (
        <div className="relative">
          <label
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors",
              clientConfirmed
                ? "bg-teal-50/80 border-teal-300"
                : "bg-amber-50/80 border-amber-300"
            )}
          >
            <input
              type="checkbox"
              checked={clientConfirmed}
              onChange={(e) => setClientConfirmed(e.target.checked)}
              disabled={isProcessing}
              className="mt-0.5 h-5 w-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 accent-teal-600 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-bold",
                clientConfirmed ? "text-teal-800" : "text-amber-800"
              )}>
                <ShieldCheck className="inline h-4 w-4 mr-1 -mt-0.5" />
                得意先の確認
              </p>
              <p className={cn(
                "text-sm mt-0.5",
                clientConfirmed ? "text-teal-700" : "text-amber-700"
              )}>
                「<span className="font-bold">{clientName}</span>」のファイルをアップロードします。間違いありませんか？
              </p>
            </div>
          </label>
          {/* Step 2: 得意先選択済み・未確認 → 吹き出しナビ */}
          {!clientConfirmed && (
            <div className="absolute top-full left-8 mt-2 z-10">
              <div className="relative bg-amber-500 text-white text-sm font-medium rounded-full px-4 py-2 shadow-lg animate-bounce whitespace-nowrap">
                ↑ チェックを入れて確認してください
                <div className="absolute bottom-full left-6 border-8 border-transparent border-b-amber-500" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ドロップゾーン */}
      <div className="relative">
        <label
          onDragOver={clientConfirmed ? handleDragOver : undefined}
          onDragLeave={clientConfirmed ? handleDragLeave : undefined}
          onDrop={clientConfirmed ? handleDrop : undefined}
          htmlFor={isProcessing || !clientConfirmed ? undefined : "file-input-upload"}
          className={cn(
            "block border-2 border-dashed rounded-xl p-10 text-center transition-colors",
            !clientConfirmed
              ? "border-gray-200 bg-gray-50/50 opacity-50 cursor-not-allowed"
              : isDragOver
                ? "border-teal-400 bg-teal-50 cursor-pointer"
                : "border-gray-300 bg-gray-50 hover:border-gray-400 cursor-pointer",
            isProcessing && "pointer-events-none opacity-60"
          )}
        >
          <input
            id="file-input-upload"
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={handleFileSelect}
            disabled={!clientConfirmed || isProcessing}
          />
          <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-1">
            ファイルをドラッグ&ドロップ（複数可）
          </p>
          <p className="text-sm text-gray-500">
            またはクリックしてファイルを選択（PDF, JPEG, PNG, HEIC 等）
          </p>
          <p className="text-xs text-teal-600 mt-2">
            ファイルを追加してから「送信」ボタンでアップロード＆OCR処理を開始します
          </p>
        </label>
        {/* Step 3: 確認済み・ファイル未追加 → 吹き出しナビ */}
        {clientConfirmed && files.length === 0 && !isProcessing && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
            <div className="relative bg-amber-500 text-white text-sm font-medium rounded-full px-4 py-2 shadow-lg animate-bounce whitespace-nowrap">
              ↓ ファイルをドラッグ&ドロップ！
              <div className="absolute left-1/2 -translate-x-1/2 top-full border-8 border-transparent border-t-amber-500" />
            </div>
          </div>
        )}
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
                <ImageIcon className="w-5 h-5 text-teal-500 flex-shrink-0" />
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
                      : item.status === "uploaded"
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

      {/* ステータスバー & 送信ボタン */}
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
                {files.length} ファイル
                {doneCount > 0 && ` (${doneCount} 完了)`}
                {errorCount > 0 && ` (${errorCount} エラー)`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isProcessing && hasPendingFiles && (
              <button
                onClick={() => setFiles([])}
                className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
              >
                すべてクリア
              </button>
            )}
            {!isProcessing && hasPendingFiles && (
              <div className="relative">
                <button
                  onClick={handleBulkProcess}
                  disabled={!clientId || !clientConfirmed}
                  className={cn(
                    "flex items-center gap-2 px-6 py-2.5 rounded-lg transition-colors text-sm font-medium",
                    !clientId || !clientConfirmed
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-teal-600 text-white hover:bg-teal-700"
                  )}
                >
                  <Send className="w-4 h-4" />
                  送信してOCR処理を開始
                </button>
                {clientId && clientConfirmed && (
                  <div className="absolute -top-9 right-0">
                    <span className="bg-amber-500 text-white text-sm rounded-full px-3 py-1.5 shadow-lg animate-bounce whitespace-nowrap inline-block">
                      ↓ ここを押して送信！
                    </span>
                  </div>
                )}
              </div>
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
