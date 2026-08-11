import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { MODEL_CATALOG, findModel } from "@/lib/ai/registry";
import { resolveModel } from "@/lib/ai";
import { SETTING_KEYS, setSetting } from "@/lib/settings";

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

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const [ocr, classify] = await Promise.all([
      resolveModel("ocr"),
      resolveModel("classify"),
    ]);

    return NextResponse.json({
      catalog: MODEL_CATALOG,
      ocrModel: ocr.modelId,
      classifyModel: classify.modelId,
      sources: { ocr: ocr.source, classify: classify.source },
      // APIキーの有無だけを返す。値は絶対に返さない。
      providerKeys: {
        gemini: Boolean(process.env.GEMINI_API_KEY),
        openai: Boolean(process.env.OPENAI_API_KEY),
      },
    });
  } catch (err) {
    console.error("AIモデル設定の取得に失敗:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "AIモデル設定の取得に失敗しました", code: "AI_MODELS_GET_FAILED", detail },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { ocrModel, classifyModel } = await request.json();

    // カタログに存在するモデルしか保存しない（自由記述のIDは受け付けない）
    for (const [label, value] of [
      ["OCRモデル", ocrModel],
      ["仕訳分類モデル", classifyModel],
    ] as const) {
      if (value !== undefined && !findModel(value)) {
        return NextResponse.json(
          { error: `${label}に不正な値が指定されました`, code: "AI_MODEL_INVALID" },
          { status: 400 }
        );
      }
    }

    if (ocrModel !== undefined) {
      await setSetting(SETTING_KEYS.ocrModel, ocrModel);
    }
    if (classifyModel !== undefined) {
      await setSetting(SETTING_KEYS.classifyModel, classifyModel);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("AIモデル設定の保存に失敗:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "AIモデル設定の保存に失敗しました", code: "AI_MODELS_PUT_FAILED", detail },
      { status: 500 }
    );
  }
}
