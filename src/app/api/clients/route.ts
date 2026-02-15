import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const clients = await prisma.company.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ clients });
  } catch (error) {
    console.error("Error fetching clients:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "得意先の取得に失敗しました", code: "CLIENT_LIST_FAILED", detail },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "得意先名を入力してください", code: "CLIENT_NO_NAME" },
        { status: 400 }
      );
    }

    const client = await prisma.company.create({
      data: { name: name.trim() },
    });

    return NextResponse.json({ client });
  } catch (error) {
    console.error("Error creating client:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "得意先の作成に失敗しました", code: "CLIENT_CREATE_FAILED", detail },
      { status: 500 }
    );
  }
}
