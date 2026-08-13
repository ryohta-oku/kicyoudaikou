import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const role = request.nextUrl.searchParams.get("role");
    if (!role) {
      return NextResponse.json({ error: "roleパラメータが必要です" }, { status: 400 });
    }

    const count = await prisma.user.count({ where: { role } });
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error counting users:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "ユーザー数の取得に失敗しました", detail }, { status: 500 });
  }
}
