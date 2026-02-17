import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readdir, readFile, mkdir, rename, stat } from "fs/promises";
import { writeFile } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { getUploadBaseDir } from "@/lib/storage";
import convert from "heic-convert";

const SUPPORTED_EXTENSIONS = [
  ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tiff", ".tif", ".heic", ".heif",
];

function getFileTypeFromExt(ext: string): string {
  const lower = ext.toLowerCase();
  if (lower === ".pdf") return "pdf";
  if (lower === ".heic" || lower === ".heif") return "heic";
  if (lower === ".jpg" || lower === ".jpeg") return "jpeg";
  if (lower === ".tif" || lower === ".tiff") return "tiff";
  return lower.replace(".", "");
}

function getWatchFolder(): string | null {
  return process.env.SCAN_WATCH_FOLDER || null;
}

async function listPendingFiles(watchFolder: string): Promise<{ name: string; size: number; modifiedAt: string }[]> {
  try {
    const entries = await readdir(watchFolder);
    const files: { name: string; size: number; modifiedAt: string }[] = [];

    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;
      // "processed" フォルダ内のファイルは除外
      if (entry.startsWith(".")) continue;

      try {
        const fileStat = await stat(path.join(watchFolder, entry));
        if (fileStat.isFile()) {
          files.push({
            name: entry,
            size: fileStat.size,
            modifiedAt: fileStat.mtime.toISOString(),
          });
        }
      } catch {
        // skip unreadable files
      }
    }

    // 更新日時順
    files.sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt));
    return files;
  } catch {
    return [];
  }
}

/**
 * GET /api/scan
 * スキャンフォルダの待機ファイルを確認
 */
export async function GET() {
  const watchFolder = getWatchFolder();

  if (!watchFolder) {
    return NextResponse.json({
      configured: false,
      files: [],
      count: 0,
    });
  }

  const files = await listPendingFiles(watchFolder);

  return NextResponse.json({
    configured: true,
    watchFolder,
    files,
    count: files.length,
  });
}

/**
 * POST /api/scan
 * スキャンフォルダからファイルを取り込み
 */
export async function POST(request: NextRequest) {
  const watchFolder = getWatchFolder();

  if (!watchFolder) {
    return NextResponse.json(
      { error: "スキャンフォルダが設定されていません", code: "SCAN_NOT_CONFIGURED" },
      { status: 400 }
    );
  }

  const files = await listPendingFiles(watchFolder);

  if (files.length === 0) {
    return NextResponse.json(
      { error: "取り込むファイルがありません", code: "SCAN_NO_FILES" },
      { status: 400 }
    );
  }

  try {
    // リクエストボディからclientIdを取得
    let clientId: string | null = null;
    try {
      const body = await request.json();
      clientId = body.clientId || null;
    } catch {
      // empty body is ok
    }

    // フォルダを作成
    const now = new Date();
    const folderName = `スキャン取り込み ${now.toLocaleDateString("ja-JP")} ${now.toLocaleTimeString("ja-JP")}`;
    const folder = await prisma.folder.create({
      data: {
        name: folderName,
        creator: "ScanSnap",
        clientId,
      },
    });

    // processedフォルダを作成
    const processedDir = path.join(watchFolder, "processed");
    await mkdir(processedDir, { recursive: true });

    // アップロードディレクトリを準備
    const uploadDir = getUploadBaseDir();
    await mkdir(uploadDir, { recursive: true });

    const importedDocuments: { id: string; filename: string }[] = [];

    for (const file of files) {
      const sourcePath = path.join(watchFolder, file.name);
      const ext = path.extname(file.name);
      const fileId = uuidv4();
      let fileType = getFileTypeFromExt(ext);

      // ファイルを読み込み
      const buffer = await readFile(sourcePath);

      // アップロードディレクトリにコピー
      let finalBuffer = buffer;
      let savedFilename = `${fileId}${ext}`;

      // HEIC → JPEG変換
      if (fileType === "heic") {
        try {
          const jpegData = await convert({
            buffer: new Uint8Array(buffer) as unknown as ArrayBuffer,
            format: "JPEG",
            quality: 0.95,
          });
          finalBuffer = Buffer.from(jpegData as ArrayBuffer);
          savedFilename = `${fileId}.jpg`;
          fileType = "jpeg";
        } catch (heicError) {
          console.error("HEIC conversion failed:", heicError);
        }
      }

      // ファイルを保存
      const destPath = path.join(uploadDir, savedFilename);
      await writeFile(destPath, finalBuffer);

      // DBにドキュメントを作成
      const document = await prisma.document.create({
        data: {
          filename: file.name,
          filepath: `/uploads/${savedFilename}`,
          fileType,
          fileData: finalBuffer,
          title: file.name.replace(/\.[^.]+$/, ""),
          creator: "ScanSnap",
          folderId: folder.id,
          status: "uploaded",
        },
      });

      importedDocuments.push({ id: document.id, filename: file.name });

      // 元ファイルをprocessedフォルダに移動
      const processedPath = path.join(processedDir, file.name);
      try {
        await rename(sourcePath, processedPath);
      } catch {
        // 移動に失敗しても続行（別ドライブの場合など）
        console.error(`Failed to move ${file.name} to processed folder`);
      }
    }

    return NextResponse.json({
      folder: { id: folder.id, name: folder.name },
      imported: importedDocuments,
      count: importedDocuments.length,
    });
  } catch (error) {
    console.error("Scan import error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "スキャン取り込みに失敗しました", code: "SCAN_IMPORT_FAILED", detail },
      { status: 500 }
    );
  }
}
