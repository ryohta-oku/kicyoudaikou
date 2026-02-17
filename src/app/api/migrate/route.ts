import { NextResponse } from "next/server";

/**
 * Turso データベースのスキーマをマイグレーションする一時的なAPIエンドポイント
 * デプロイ後に1回アクセスすれば不足テーブル・カラムが追加される
 * GET /api/migrate
 */
export async function GET() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    return NextResponse.json(
      { error: "TURSO_DATABASE_URL が設定されていません" },
      { status: 500 }
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require("@libsql/client");
    const client = createClient({ url, authToken });

    const results: string[] = [];

    // 現在のテーブル一覧を取得
    const tableList = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const existingTables = tableList.rows.map((r: { name: string }) => r.name);
    results.push(`既存テーブル: ${existingTables.join(", ")}`);

    // --- Folder テーブル ---
    if (!existingTables.includes("Folder")) {
      await client.execute(`
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
      results.push("Folder テーブルは既に存在します");
    }

    // --- Document テーブル ---
    if (!existingTables.includes("Document")) {
      await client.execute(`
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
      const docInfo = await client.execute("PRAGMA table_info(Document)");
      const docColumns = docInfo.rows.map((r: { name: string }) => r.name);
      if (!docColumns.includes("fileType")) {
        await client.execute(
          `ALTER TABLE "Document" ADD COLUMN "fileType" TEXT NOT NULL DEFAULT 'pdf'`
        );
        results.push("✓ Document.fileType カラムを追加しました");
      }
      if (!docColumns.includes("fileData")) {
        await client.execute(
          `ALTER TABLE "Document" ADD COLUMN "fileData" BLOB`
        );
        results.push("✓ Document.fileData カラムを追加しました");
      }
      if (!docColumns.includes("title")) {
        await client.execute(
          `ALTER TABLE "Document" ADD COLUMN "title" TEXT NOT NULL DEFAULT ''`
        );
        results.push("✓ Document.title カラムを追加しました");
      }
      if (!docColumns.includes("creator")) {
        await client.execute(
          `ALTER TABLE "Document" ADD COLUMN "creator" TEXT NOT NULL DEFAULT ''`
        );
        results.push("✓ Document.creator カラムを追加しました");
      }
      if (!docColumns.includes("folderId")) {
        await client.execute(
          `ALTER TABLE "Document" ADD COLUMN "folderId" TEXT REFERENCES "Folder"("id") ON DELETE CASCADE`
        );
        results.push("✓ Document.folderId カラムを追加しました");
      }
      results.push("Document テーブルは既に存在します");
    }

    // --- DocumentPage テーブル ---
    if (!existingTables.includes("DocumentPage")) {
      await client.execute(`
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
      await client.execute(`
        CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key"
        ON "DocumentPage" ("documentId", "pageNumber")
      `);
      results.push("✓ DocumentPage テーブルを作成しました");
    } else {
      const pageInfo = await client.execute("PRAGMA table_info(DocumentPage)");
      const pageColumns = pageInfo.rows.map((r: { name: string }) => r.name);
      if (!pageColumns.includes("imageData")) {
        await client.execute(
          `ALTER TABLE "DocumentPage" ADD COLUMN "imageData" BLOB`
        );
        results.push("✓ DocumentPage.imageData カラムを追加しました");
      }
      results.push("DocumentPage テーブルは既に存在します");
    }

    // --- JournalEntry テーブル ---
    if (!existingTables.includes("JournalEntry")) {
      await client.execute(`
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
          "isConfirmed" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE,
          FOREIGN KEY ("pageId") REFERENCES "DocumentPage" ("id")
        )
      `);
      results.push("✓ JournalEntry テーブルを作成しました");
    } else {
      const jeInfo = await client.execute("PRAGMA table_info(JournalEntry)");
      const jeColumns = jeInfo.rows.map((r: { name: string }) => r.name);
      if (!jeColumns.includes("aiReasoning")) {
        await client.execute(
          `ALTER TABLE "JournalEntry" ADD COLUMN "aiReasoning" TEXT NOT NULL DEFAULT ''`
        );
        results.push("✓ JournalEntry.aiReasoning カラムを追加しました");
      }
      if (!jeColumns.includes("duplicateDismissed")) {
        await client.execute(
          `ALTER TABLE "JournalEntry" ADD COLUMN "duplicateDismissed" INTEGER NOT NULL DEFAULT 0`
        );
        results.push("✓ JournalEntry.duplicateDismissed カラムを追加しました");
      }
      results.push("JournalEntry テーブルは既に存在します");
    }

    // --- Account テーブル ---
    if (!existingTables.includes("Account")) {
      await client.execute(`
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
      await client.execute(`
        CREATE TABLE "SubAccount" (
          "id" TEXT PRIMARY KEY NOT NULL,
          "accountId" TEXT NOT NULL,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE
        )
      `);
      await client.execute(`
        CREATE UNIQUE INDEX "SubAccount_accountId_code_key"
        ON "SubAccount" ("accountId", "code")
      `);
      results.push("✓ SubAccount テーブルを作成しました");
    } else {
      results.push("SubAccount テーブルは既に存在します");
    }

    // 最終テーブル一覧を確認
    const finalTables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    results.push(
      `最終テーブル一覧: ${finalTables.rows.map((r: { name: string }) => r.name).join(", ")}`
    );

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "マイグレーション失敗", detail }, { status: 500 });
  }
}
