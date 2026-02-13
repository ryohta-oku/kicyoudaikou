import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const folders = await prisma.folder.findMany({
      include: {
        documents: {
          select: {
            id: true,
            filename: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ folders });
  } catch (error) {
    console.error("Error fetching folders:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "フォルダの取得に失敗しました", code: "FOLDER_LIST_FAILED", detail },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, creator } = await request.json();

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "フォルダ名を入力してください", code: "FOLDER_NO_NAME" },
        { status: 400 }
      );
    }

    const folder = await prisma.folder.create({
      data: {
        name: name.trim(),
        creator: creator || "",
      },
    });

    return NextResponse.json({ folder });
  } catch (error) {
    console.error("Error creating folder:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "フォルダの作成に失敗しました", code: "FOLDER_CREATE_FAILED", detail },
      { status: 500 }
    );
  }
}
