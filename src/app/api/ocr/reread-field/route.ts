import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { toPhysicalPath } from "@/lib/storage";
import { getGeminiClient, OCR_MODEL } from "@/lib/gemini";

export const maxDuration = 30;

const FIELD_PROMPTS: Record<string, string> = {
  registrationNumber:
    "この画像から適格請求書発行事業者の登録番号を読み取ってください。\n" +
    "登録番号のフォーマット: T + 数字13桁 = 合計14文字（例: T1234567890123）\n\n" +
    "注意:\n" +
    "- 必ず「T」で始まり、その後に数字が正確に13桁続きます\n" +
    "- 1桁でも多い・少ない場合は読み取りミスです。画像を再確認してください\n" +
    "- 「登録番号」「登録No」「T」の文字の近くに印字されていることが多いです\n" +
    "- レシートや領収書は文字がかすれたり薄くなっている場合があります。周辺の文脈から推測してください\n" +
    "- よくある誤読: 5↔6, 1↔l, 0↔O, 8↔B — 数字13桁であることを確認してください\n" +
    "- 番号のみを返してください（T + 13桁の数字）\n" +
    "- 見つからない場合は空文字を返してください",
};

type PageMedia =
  | { type: "image"; base64: string; mimeType: string }
  | { type: "pdf"; base64: string };

async function getPageMedia(page: {
  imagePath: string;
  imageData: Uint8Array | null;
  documentId: string;
}): Promise<PageMedia> {
  const ext = path.extname(page.imagePath).toLowerCase();
  const isPdf = ext === ".pdf";

  // PDFの場合、Documentの元ファイルから読み込む
  if (isPdf) {
    const document = await prisma.document.findUnique({
      where: { id: page.documentId },
    });
    if (!document) throw new Error("ドキュメントが見つかりません");

    const filePath = toPhysicalPath(document.filepath);
    try {
      const buffer = await readFile(filePath);
      return { type: "pdf", base64: buffer.toString("base64") };
    } catch {
      // ディスクにない場合、DBから復元
    }
    if (!document.fileData) throw new Error("PDFデータが見つかりません");
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, Buffer.from(document.fileData));
    const buffer = await readFile(filePath);
    return { type: "pdf", base64: buffer.toString("base64") };
  }

  // 画像の場合
  const physicalPath = toPhysicalPath(page.imagePath);
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };

  try {
    const buffer = await readFile(physicalPath);
    return {
      type: "image",
      base64: buffer.toString("base64"),
      mimeType: mimeMap[ext] || "image/jpeg",
    };
  } catch {
    // ディスクにない場合
  }

  if (!page.imageData) throw new Error("画像データが見つかりません");
  const dir = path.dirname(physicalPath);
  await mkdir(dir, { recursive: true });
  await writeFile(physicalPath, Buffer.from(page.imageData));
  const buffer = await readFile(physicalPath);
  return {
    type: "image",
    base64: buffer.toString("base64"),
    mimeType: mimeMap[ext] || "image/jpeg",
  };
}

export async function POST(request: NextRequest) {
  try {
    const { pageId, fieldName } = await request.json();

    if (!pageId || !fieldName) {
      return NextResponse.json(
        { error: "pageId と fieldName が必要です" },
        { status: 400 }
      );
    }

    const prompt = FIELD_PROMPTS[fieldName];
    if (!prompt) {
      return NextResponse.json(
        { error: `未対応のフィールド: ${fieldName}` },
        { status: 400 }
      );
    }

    const page = await prisma.documentPage.findUnique({
      where: { id: pageId },
    });

    if (!page) {
      return NextResponse.json(
        { error: "ページが見つかりません" },
        { status: 404 }
      );
    }

    const media = await getPageMedia({
      imagePath: page.imagePath,
      imageData: page.imageData,
      documentId: page.documentId,
    });

    const ai = getGeminiClient();

    // PDF と画像で送信形式を分ける（Gemini inlineData 形式）
    const mediaPart =
      media.type === "pdf"
        ? { inlineData: { mimeType: "application/pdf", data: media.base64 } }
        : { inlineData: { mimeType: media.mimeType, data: media.base64 } };

    const response = await ai.models.generateContent({
      model: OCR_MODEL,
      contents: [
        {
          role: "user",
          parts: [mediaPart, { text: prompt }],
        },
      ],
      config: {
        maxOutputTokens: 256,
      },
    });

    const raw = (response.text || "").trim();
    let value = raw;

    // 登録番号の場合、T + 13桁の数字パターンのみ許容（それ以外は空）
    if (fieldName === "registrationNumber") {
      const match = raw.match(/T\d{13}/);
      value = match ? match[0] : "";
    }

    return NextResponse.json({ value, raw });
  } catch (error) {
    console.error("Reread field error:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "再読み取りに失敗しました", detail },
      { status: 500 }
    );
  }
}
