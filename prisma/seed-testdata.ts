/**
 * テストデータ seed スクリプト
 *
 * 本番に近いテストデータを登録する。
 * - 各種ファイル形式（JPEG, PDF, HEIC, 二重拡張子）
 * - 大きめのファイル（メモリ制限テスト）
 * - 各ステータスのドキュメント
 *
 * 使い方: npx tsx prisma/seed-testdata.ts
 */

import { prisma } from "../src/lib/prisma";
import { readFile, writeFile, access } from "fs/promises";
import path from "path";

const TEST_DATA_DIR = path.join(__dirname, "test-data");

interface TestFile {
  filename: string;
  fileType: string;
  description: string;
}

const TEST_FILES: TestFile[] = [
  { filename: "sample-receipt.jpg", fileType: "jpeg", description: "通常のJPEG領収書" },
  { filename: "sample-invoice.pdf", fileType: "pdf", description: "PDF請求書" },
  { filename: "IMG_TEST.HEIC", fileType: "heic", description: "HEIC画像（iPhone撮影）" },
  { filename: "IMG_TEST.HEIC.pdf", fileType: "pdf", description: "二重拡張子（実体はHEIC）" },
  { filename: "large-receipt.jpg", fileType: "jpeg", description: "大きいJPEG（2MB、メモリテスト）" },
];

/** large-receipt.jpg が存在しなければ自動生成（gitignoreで除外されるため） */
async function ensureLargeFile() {
  const filePath = path.join(TEST_DATA_DIR, "large-receipt.jpg");
  try {
    await access(filePath);
  } catch {
    console.log("large-receipt.jpg を生成中（2MB）...");
    // Minimal JPEG with 2MB padding
    const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const jfif = Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary");
    const padding = Buffer.alloc(2 * 1024 * 1024);
    const footer = Buffer.from([0xff, 0xd9]);
    await writeFile(filePath, Buffer.concat([header, jfif, padding, footer]));
  }
}

async function main() {
  console.log("テストデータを登録中...\n");
  await ensureLargeFile();

  // 得意先を取得（なければ作成）
  let client = await prisma.company.findFirst();
  if (!client) {
    client = await prisma.company.create({ data: { name: "株式会社テスト" } });
    console.log("得意先「株式会社テスト」を作成しました");
  }

  // テストフォルダを作成
  const now = new Date();
  const folderName = `テストデータ ${now.toLocaleDateString("ja-JP")} ${now.toLocaleTimeString("ja-JP")}`;
  const folder = await prisma.folder.create({
    data: {
      name: folderName,
      creator: "seed-testdata",
      clientId: client.id,
    },
  });
  console.log(`フォルダ「${folderName}」を作成しました\n`);

  // テストファイルをドキュメントとして登録
  for (const testFile of TEST_FILES) {
    const filePath = path.join(TEST_DATA_DIR, testFile.filename);
    try {
      const buffer = await readFile(filePath);

      const document = await prisma.document.create({
        data: {
          filename: testFile.filename,
          filepath: `/uploads/test-${testFile.filename}`,
          fileType: testFile.fileType,
          fileData: buffer,
          title: testFile.description,
          creator: "seed-testdata",
          folderId: folder.id,
          status: "uploaded",
        },
      });

      console.log(`  ✓ ${testFile.filename} (${(buffer.length / 1024).toFixed(0)}KB) → ${document.id}`);
    } catch (err) {
      console.error(`  ✗ ${testFile.filename}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n完了: ${TEST_FILES.length} 件のテストドキュメントを登録しました`);
  console.log(`フォルダID: ${folder.id}`);
  console.log(`\nこのフォルダでOCR処理を実行してテストしてください。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
