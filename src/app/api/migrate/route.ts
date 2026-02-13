import { NextResponse } from "next/server";

/**
 * Turso データベースのスキーマをマイグレーションする一時的なAPIエンドポイント
 * デプロイ後に1回アクセスすれば不足カラムが追加される
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

    // Document テーブルの現在のカラムを確認
    const info = await client.execute("PRAGMA table_info(Document)");
    const columns = info.rows.map((r: { name: string }) => r.name);
    results.push(`現在のカラム: ${columns.join(", ")}`);

    // fileType カラムが無ければ追加
    if (!columns.includes("fileType")) {
      await client.execute(
        `ALTER TABLE "Document" ADD COLUMN "fileType" TEXT NOT NULL DEFAULT 'pdf'`
      );
      results.push("✓ fileType カラムを追加しました");
    } else {
      results.push("fileType カラムは既に存在します");
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "マイグレーション失敗", detail }, { status: 500 });
  }
}
