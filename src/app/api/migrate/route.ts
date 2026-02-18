import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * データベースのスキーマをマイグレーションする一時的なAPIエンドポイント
 * デプロイ後に1回アクセスすれば不足テーブル・カラムが追加される
 * Prisma経由で接続するため、環境変数の問題を回避
 * GET /api/migrate
 */
export async function GET() {
  try {
    const results: string[] = [];

    // 現在のテーブル一覧を取得
    const tableList = await prisma.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const existingTables = tableList.map((r) => r.name);
    results.push(`既存テーブル: ${existingTables.join(", ")}`);

    // --- Folder テーブル ---
    if (!existingTables.includes("Folder")) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "Folder" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "name" TEXT NOT NULL,
          "creator" TEXT NOT NULL DEFAULT '',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      results.push("✓ Folder テーブルを作成しました");
    } else {
      // Folder テーブルに引き継ぎ関連カラムを追加
      const folderInfo = await prisma.$queryRawUnsafe<{ name: string }[]>(
        "PRAGMA table_info(Folder)"
      );
      const folderColumns = folderInfo.map((r) => r.name);
      if (!folderColumns.includes("handoffStatus")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Folder" ADD COLUMN "handoffStatus" TEXT`
        );
        results.push("✓ Folder.handoffStatus カラムを追加しました");
      }
      if (!folderColumns.includes("handoffBy")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Folder" ADD COLUMN "handoffBy" TEXT NOT NULL DEFAULT ''`
        );
        results.push("✓ Folder.handoffBy カラムを追加しました");
      }
      if (!folderColumns.includes("handoffAt")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Folder" ADD COLUMN "handoffAt" DATETIME`
        );
        results.push("✓ Folder.handoffAt カラムを追加しました");
      }
      results.push("Folder テーブルは既に存在します");
    }

    // --- Document テーブル ---
    if (!existingTables.includes("Document")) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "Document" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "folderId" TEXT,
          "filename" TEXT NOT NULL,
          "filepath" TEXT NOT NULL,
          "fileType" TEXT NOT NULL DEFAULT 'pdf',
          "title" TEXT NOT NULL DEFAULT '',
          "creator" TEXT NOT NULL DEFAULT '',
          "status" TEXT NOT NULL DEFAULT 'uploaded',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE CASCADE
        )
      `);
      results.push("✓ Document テーブルを作成しました");
    } else {
      const docInfo = await prisma.$queryRawUnsafe<{ name: string }[]>(
        "PRAGMA table_info(Document)"
      );
      const docColumns = docInfo.map((r) => r.name);
      if (!docColumns.includes("fileType")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Document" ADD COLUMN "fileType" TEXT NOT NULL DEFAULT 'pdf'`
        );
        results.push("✓ Document.fileType カラムを追加しました");
      }
      if (!docColumns.includes("fileData")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Document" ADD COLUMN "fileData" BLOB`
        );
        results.push("✓ Document.fileData カラムを追加しました");
      }
      if (!docColumns.includes("title")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Document" ADD COLUMN "title" TEXT NOT NULL DEFAULT ''`
        );
        results.push("✓ Document.title カラムを追加しました");
      }
      if (!docColumns.includes("creator")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Document" ADD COLUMN "creator" TEXT NOT NULL DEFAULT ''`
        );
        results.push("✓ Document.creator カラムを追加しました");
      }
      if (!docColumns.includes("folderId")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "Document" ADD COLUMN "folderId" TEXT REFERENCES "Folder"("id") ON DELETE CASCADE`
        );
        results.push("✓ Document.folderId カラムを追加しました");
      }
      results.push("Document テーブルは既に存在します");
    }

    // --- DocumentPage テーブル ---
    if (!existingTables.includes("DocumentPage")) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "DocumentPage" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "documentId" TEXT NOT NULL,
          "pageNumber" INTEGER NOT NULL,
          "imagePath" TEXT NOT NULL,
          "ocrText" TEXT NOT NULL DEFAULT '',
          "correctedText" TEXT NOT NULL DEFAULT '',
          "isConfirmed" INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key"
        ON "DocumentPage" ("documentId", "pageNumber")
      `);
      results.push("✓ DocumentPage テーブルを作成しました");
    } else {
      const pageInfo = await prisma.$queryRawUnsafe<{ name: string }[]>(
        "PRAGMA table_info(DocumentPage)"
      );
      const pageColumns = pageInfo.map((r) => r.name);
      if (!pageColumns.includes("imageData")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "DocumentPage" ADD COLUMN "imageData" BLOB`
        );
        results.push("✓ DocumentPage.imageData カラムを追加しました");
      }
      results.push("DocumentPage テーブルは既に存在します");
    }

    // --- JournalEntry テーブル ---
    if (!existingTables.includes("JournalEntry")) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "JournalEntry" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "documentId" TEXT NOT NULL,
          "pageId" TEXT,
          "date" TEXT NOT NULL,
          "description" TEXT NOT NULL,
          "accountCode" TEXT NOT NULL DEFAULT '',
          "accountName" TEXT NOT NULL DEFAULT '',
          "subAccountCode" TEXT NOT NULL DEFAULT '',
          "subAccountName" TEXT NOT NULL DEFAULT '',
          "debitAmount" INTEGER NOT NULL DEFAULT 0,
          "creditAmount" INTEGER NOT NULL DEFAULT 0,
          "taxRate" TEXT NOT NULL DEFAULT '',
          "aiSuggested" INTEGER NOT NULL DEFAULT 0,
          "aiReasoning" TEXT NOT NULL DEFAULT '',
          "isConfirmed" INTEGER NOT NULL DEFAULT 0,
          "duplicateDismissed" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE,
          FOREIGN KEY ("pageId") REFERENCES "DocumentPage" ("id")
        )
      `);
      results.push("✓ JournalEntry テーブルを作成しました");
    } else {
      const jeInfo = await prisma.$queryRawUnsafe<{ name: string }[]>(
        "PRAGMA table_info(JournalEntry)"
      );
      const jeColumns = jeInfo.map((r) => r.name);
      if (!jeColumns.includes("aiReasoning")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "JournalEntry" ADD COLUMN "aiReasoning" TEXT NOT NULL DEFAULT ''`
        );
        results.push("✓ JournalEntry.aiReasoning カラムを追加しました");
      }
      if (!jeColumns.includes("duplicateDismissed")) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "JournalEntry" ADD COLUMN "duplicateDismissed" INTEGER NOT NULL DEFAULT 0`
        );
        results.push("✓ JournalEntry.duplicateDismissed カラムを追加しました");
      }
      results.push("JournalEntry テーブルは既に存在します");
    }

    // --- Account テーブル ---
    if (!existingTables.includes("Account")) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "Account" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "code" TEXT NOT NULL UNIQUE,
          "name" TEXT NOT NULL,
          "category" TEXT NOT NULL
        )
      `);
      results.push("✓ Account テーブルを作成しました");
    } else {
      results.push("Account テーブルは既に存在します");
    }

    // --- SubAccount テーブル ---
    if (!existingTables.includes("SubAccount")) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "SubAccount" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "accountId" TEXT NOT NULL,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX "SubAccount_accountId_code_key"
        ON "SubAccount" ("accountId", "code")
      `);
      results.push("✓ SubAccount テーブルを作成しました");
    } else {
      results.push("SubAccount テーブルは既に存在します");
    }

    // --- WorkSession テーブル ---
    if (!existingTables.includes("WorkSession")) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "WorkSession" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "userId" TEXT NOT NULL,
          "userName" TEXT NOT NULL DEFAULT '',
          "userRole" TEXT NOT NULL DEFAULT '',
          "folderId" TEXT,
          "folderName" TEXT NOT NULL DEFAULT '',
          "status" TEXT NOT NULL DEFAULT 'active',
          "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "completedAt" DATETIME,
          "totalSec" INTEGER NOT NULL DEFAULT 0,
          "documentCount" INTEGER NOT NULL DEFAULT 0
        )
      `);
      results.push("✓ WorkSession テーブルを作成しました");
    } else {
      results.push("WorkSession テーブルは既に存在します");
    }

    // --- WorkLog テーブル ---
    if (!existingTables.includes("WorkLog")) {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "WorkLog" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "sessionId" TEXT,
          "userId" TEXT NOT NULL,
          "userName" TEXT NOT NULL DEFAULT '',
          "userRole" TEXT NOT NULL DEFAULT '',
          "folderId" TEXT,
          "folderName" TEXT NOT NULL DEFAULT '',
          "documentId" TEXT,
          "action" TEXT NOT NULL,
          "workType" TEXT NOT NULL,
          "durationSec" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("sessionId") REFERENCES "WorkSession" ("id")
        )
      `);
      results.push("✓ WorkLog テーブルを作成しました");
    } else {
      results.push("WorkLog テーブルは既に存在します");
    }

    // 最終テーブル一覧を確認
    const finalTables = await prisma.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    results.push(
      `最終テーブル一覧: ${finalTables.map((r) => r.name).join(", ")}`
    );

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "マイグレーション失敗", detail }, { status: 500 });
  }
}
