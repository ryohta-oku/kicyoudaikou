import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "ファイルが選択されていません" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "PDFファイルのみアップロード可能です" }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const fileId = uuidv4();
    const ext = path.extname(file.name);
    const savedFilename = `${fileId}${ext}`;
    const filepath = path.join(uploadDir, savedFilename);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filepath, buffer);

    const document = await prisma.document.create({
      data: {
        filename: file.name,
        filepath: `/uploads/${savedFilename}`,
        status: "uploaded",
      },
    });

    return NextResponse.json({ document });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "アップロードに失敗しました" }, { status: 500 });
  }
}
