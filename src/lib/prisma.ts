import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  if (process.env.TURSO_DATABASE_URL) {
    // ドライバーアダプター使用時もPrismaがdatasource URLを検証するためフォールバックを設定
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = "file:./placeholder.db";
    }
    // Turso（クラウドSQLite）環境 - 本番用
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

  // Vercel環境ではTursoが必須
  if (process.env.VERCEL === "1") {
    throw new Error(
      "TURSO_DATABASE_URL が設定されていません。" +
      "Vercel の環境変数に TURSO_DATABASE_URL と TURSO_AUTH_TOKEN を設定してください。"
    );
  }

  // ローカル開発用 (better-sqlite3)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./dev.db",
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
