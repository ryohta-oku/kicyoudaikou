import { NextResponse } from "next/server";

/**
 * デバッグ用: DB接続テスト＆ドキュメント一覧確認
 * GET /api/debug
 */
export async function GET() {
  const results: Record<string, unknown> = {};

  try {
    // Turso に直接接続してテーブル内容を確認
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    results.env = {
      hasTursoUrl: !!url,
      hasTursoToken: !!authToken,
      isVercel: process.env.VERCEL === "1",
      nodeEnv: process.env.NODE_ENV,
    };

    if (url) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClient } = require("@libsql/client");
      const client = createClient({ url, authToken });

      // テーブル一覧
      const tables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      );
      results.tables = tables.rows.map((r: { name: string }) => r.name);

      // Document テーブルのカラム情報
      const docInfo = await client.execute("PRAGMA table_info(Document)");
      results.documentColumns = docInfo.rows.map(
        (r: { name: string; type: string }) => `${r.name} (${r.type})`
      );

      // Document レコード数と一覧
      const docCount = await client.execute("SELECT COUNT(*) as cnt FROM Document");
      results.documentCount = docCount.rows[0]?.cnt;

      const docs = await client.execute(
        "SELECT id, filename, filepath, fileType, status, createdAt FROM Document ORDER BY createdAt DESC LIMIT 10"
      );
      results.documents = docs.rows;

      // テスト書き込み＆読み取り
      const testId = `debug-test-${Date.now()}`;
      await client.execute({
        sql: "INSERT INTO Document (id, filename, filepath, fileType, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
        args: [testId, "debug-test.pdf", "/uploads/debug-test.pdf", "pdf", "uploaded"],
      });
      const readBack = await client.execute({
        sql: "SELECT id, filename FROM Document WHERE id = ?",
        args: [testId],
      });
      results.writeReadTest = {
        written: testId,
        readBack: readBack.rows.length > 0 ? "OK" : "FAIL",
      };
      // テストレコード削除
      await client.execute({ sql: "DELETE FROM Document WHERE id = ?", args: [testId] });
    }

    // Prisma 経由でも確認
    try {
      const { prisma } = await import("@/lib/prisma");
      const prismaCount = await prisma.document.count();
      const prismaDocs = await prisma.document.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, filename: true, status: true, createdAt: true },
      });
      results.prisma = { count: prismaCount, documents: prismaDocs };
    } catch (prismaError) {
      results.prismaError =
        prismaError instanceof Error ? prismaError.message : String(prismaError);
    }

    return NextResponse.json(results);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "デバッグ失敗", detail, partial: results }, { status: 500 });
  }
}
