import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  // サーバーレス環境では /tmp に書き込む
  if (process.env.VERCEL === "1") {
    return "file:/tmp/dev.db";
  }
  return "file:./dev.db";
}

function createPrismaClient() {
  if (process.env.TURSO_DATABASE_URL) {
    // Turso（クラウドSQLite）環境
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require("@libsql/client");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibSql } = require("@prisma/adapter-libsql");
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    const adapter = new PrismaLibSql(libsql);
    return new PrismaClient({ adapter });
  }

  // ローカル開発 / サーバーレス用 (better-sqlite3)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
  const dbUrl = getDatabaseUrl();

  // サーバーレス環境で /tmp にDBがない場合はスキーマを作成
  if (process.env.VERCEL === "1") {
    ensureDatabase(dbUrl);
  }

  const adapter = new PrismaBetterSqlite3({ url: dbUrl });
  return new PrismaClient({ adapter });
}

/**
 * サーバーレス環境で /tmp/dev.db が存在しない場合にテーブルを作成する
 */
function ensureDatabase(dbUrl: string) {
  try {
    const fs = require("fs");
    const dbPath = dbUrl.replace("file:", "");
    if (!fs.existsSync(dbPath)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require("better-sqlite3");
      const db = new Database(dbPath);
      db.exec(`
        CREATE TABLE IF NOT EXISTS "Document" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "filename" TEXT NOT NULL,
          "filepath" TEXT NOT NULL,
          "fileType" TEXT NOT NULL DEFAULT 'pdf',
          "status" TEXT NOT NULL DEFAULT 'uploaded',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS "DocumentPage" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "documentId" TEXT NOT NULL,
          "pageNumber" INTEGER NOT NULL,
          "imagePath" TEXT NOT NULL,
          "ocrText" TEXT NOT NULL DEFAULT '',
          "correctedText" TEXT NOT NULL DEFAULT '',
          "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
          CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
        CREATE TABLE IF NOT EXISTS "JournalEntry" (
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
        );
        CREATE TABLE IF NOT EXISTS "Account" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "category" TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS "Account_code_key" ON "Account"("code");
        CREATE TABLE IF NOT EXISTS "SubAccount" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "accountId" TEXT NOT NULL,
          "code" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          CONSTRAINT "SubAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        );
      `);
      db.close();
    }
  } catch (e) {
    console.error("ensureDatabase error:", e);
  }
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
