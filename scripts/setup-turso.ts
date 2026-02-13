/**
 * Turso データベース初期化スクリプト
 *
 * 使い方:
 *   1. .env に TURSO_DATABASE_URL と TURSO_AUTH_TOKEN を設定
 *   2. npx tsx scripts/setup-turso.ts
 *
 * Turso CLI でDB作成・トークン取得する場合:
 *   turso db create kicyoudaikou
 *   turso db show kicyoudaikou --url     # → TURSO_DATABASE_URL
 *   turso db tokens create kicyoudaikou  # → TURSO_AUTH_TOKEN
 */

import "dotenv/config";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  console.error("エラー: TURSO_DATABASE_URL が .env に設定されていません");
  console.log("");
  console.log("Turso CLI でデータベースを作成してください:");
  console.log("  turso db create kicyoudaikou");
  console.log("  turso db show kicyoudaikou --url");
  console.log("  turso db tokens create kicyoudaikou");
  console.log("");
  console.log("取得した値を .env に設定:");
  console.log('  TURSO_DATABASE_URL="libsql://your-db-name.turso.io"');
  console.log('  TURSO_AUTH_TOKEN="your-token"');
  process.exit(1);
}

const client = createClient({ url, authToken });

async function main() {
  console.log("Turso データベースに接続中...");
  console.log(`URL: ${url}`);

  // テーブル作成
  const statements = [
    `CREATE TABLE IF NOT EXISTS "Document" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "filename" TEXT NOT NULL,
      "filepath" TEXT NOT NULL,
      "fileType" TEXT NOT NULL DEFAULT 'pdf',
      "status" TEXT NOT NULL DEFAULT 'uploaded',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "DocumentPage" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "documentId" TEXT NOT NULL,
      "pageNumber" INTEGER NOT NULL,
      "imagePath" TEXT NOT NULL,
      "ocrText" TEXT NOT NULL DEFAULT '',
      "correctedText" TEXT NOT NULL DEFAULT '',
      "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
      CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber")`,
    `CREATE TABLE IF NOT EXISTS "JournalEntry" (
      "id" TEXT NOT NULL PRIMARY KEY,
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
      "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
      "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "JournalEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "JournalEntry_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS "Account" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "category" TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Account_code_key" ON "Account"("code")`,
    `CREATE TABLE IF NOT EXISTS "SubAccount" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "accountId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      CONSTRAINT "SubAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "SubAccount_accountId_code_key" ON "SubAccount"("accountId", "code")`,
  ];

  for (const sql of statements) {
    const tableName = sql.match(/"(\w+)"/)?.[1] || "index";
    try {
      await client.execute(sql);
      console.log(`  ✓ ${tableName}`);
    } catch (e) {
      console.error(`  ✗ ${tableName}:`, e);
    }
  }

  // 確認
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  console.log("");
  console.log("作成されたテーブル:");
  for (const row of tables.rows) {
    console.log(`  - ${row.name}`);
  }

  console.log("");
  console.log("セットアップ完了！");
  console.log("");
  console.log("Vercel に以下の環境変数を設定してください:");
  console.log(`  TURSO_DATABASE_URL=${url}`);
  console.log(`  TURSO_AUTH_TOKEN=${authToken ? "(設定済み)" : "(未設定)"}`);
}

main().catch(console.error);
