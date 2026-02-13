"use client";

import { useState, useCallback } from "react";
import { Upload, File, Image as ImageIcon, X, Loader2 } from "lucide-react";
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

// image/* でHEIC含むすべての画像をファイルダイアログで選択可能にし、選択後にJSでバリデーション
const ACCEPTED_EXTENSIONS = ".pdf,image/*";

// HEICファイルはブラウザがMIMEタイプを正しく認識しないことがあるため拡張子でもチェック
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

interface FileUploadProps {
  onUploadComplete: (documentId: string) => void;
}

export default function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setError(null);

    const file = e.dataTransfer.files[0];
    if (file && isAcceptedFile(file)) {
      setSelectedFile(file);
    } else {
      setError("PDF または画像ファイル（JPEG, PNG, WebP, GIF, BMP, TIFF, HEIC）をアップロードしてください");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (file) {
      if (isAcceptedFile(file)) {
        setSelectedFile(file);
      } else {
        setError("PDF または画像ファイル（JPEG, PNG, WebP, GIF, BMP, TIFF, HEIC）をアップロードしてください");
      }
    }
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const code = data.code ? `[${data.code}] ` : "";
        const detail = data.detail ? `\n詳細: ${data.detail}` : "";
        throw new Error(`${code}${data.error || "アップロードに失敗しました"}${detail}`);
      }

      onUploadComplete(data.document.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer",
          isDragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-gray-400"
        )}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={handleFileSelect}
        />

        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <p className="text-lg font-medium text-gray-700 mb-1">
          PDF・画像ファイルをドラッグ&ドロップ
        </p>
        <p className="text-sm text-gray-500">
          またはクリックしてファイルを選択（PDF, JPEG, PNG, HEIC 等）
        </p>
      </div>

      {selectedFile && (
        <div className="flex items-center justify-between bg-white border rounded-lg p-4">
          <div className="flex items-center gap-3">
            {selectedFile && isImageFile(selectedFile) ? (
              <ImageIcon className="h-8 w-8 text-blue-500" />
            ) : (
              <File className="h-8 w-8 text-red-500" />
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
              }}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className={cn(
                "px-6 py-2 rounded-lg text-sm font-medium text-white transition-colors",
                isUploading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {isUploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  アップロード中...
                </span>
              ) : (
                "アップロード"
              )}
            </button>
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
