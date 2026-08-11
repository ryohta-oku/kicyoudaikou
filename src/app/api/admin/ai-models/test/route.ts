import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { findModel } from "@/lib/ai/registry";
import { resolveModel, testModel } from "@/lib/ai";

export const maxDuration = 60;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (session.user.role !== "admin") {
    return {
      error: NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }),
    };
  }
  return { session };
}

/**
 * 選択中（または指定）のモデルに実際に1回問い合わせて疎通を確認する。
 * 保存前の確認にも使えるよう、リクエストでモデルIDを指定できる。
 */
export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json().catch(() => ({}));

    const ocrModel = findModel(body.ocrModel)
      ? body.ocrModel
      : (await resolveModel("ocr")).modelId;
    const classifyModel = findModel(body.classifyModel)
      ? body.classifyModel
      : (await resolveModel("classify")).modelId;

    // 同じモデルなら1回で済ませる
    const [ocr, classify] =
      ocrModel === classifyModel
        ? await testModel(ocrModel).then((r) => [r, r])
        : await Promise.all([testModel(ocrModel), testModel(classifyModel)]);

    return NextResponse.json({ ocr, classify });
  } catch (err) {
    console.error("AIモデルの接続テストに失敗:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "接続テストに失敗しました", code: "AI_MODEL_TEST_FAILED", detail },
      { status: 500 }
    );
  }
}
