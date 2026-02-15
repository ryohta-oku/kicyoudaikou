import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeCompanyName } from "@/lib/companyName";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const withCounts = request.nextUrl.searchParams.get("withCounts") === "1";

    const clients = await prisma.company.findMany({
      orderBy: { createdAt: "asc" },
      ...(withCounts && {
        include: {
          _count: { select: { folders: true, subAccounts: true } },
        },
      }),
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
    const { name, force } = await request.json();

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "得意先名を入力してください", code: "CLIENT_NO_NAME" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // force でない場合、類似名チェック
    if (!force) {
      const normalized = normalizeCompanyName(trimmedName);
      if (normalized) {
        const allClients = await prisma.company.findMany();
        const similar = allClients.filter(
          (c) => normalizeCompanyName(c.name) === normalized
        );

        if (similar.length > 0) {
          return NextResponse.json(
            {
              code: "CLIENT_SIMILAR_EXISTS",
              similarClients: similar.map((c) => ({ id: c.id, name: c.name })),
            },
            { status: 409 }
          );
        }
      }
    }

    const client = await prisma.company.create({
      data: { name: trimmedName },
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

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    if (session.user.role !== "admin") {
      return NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 });
    }

    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "得意先IDが必要です" }, { status: 400 });
    }

    // 紐づきチェック
    const client = await prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { folders: true, subAccounts: true } } },
    });

    if (!client) {
      return NextResponse.json({ error: "得意先が見つかりません" }, { status: 404 });
    }

    if (client._count.folders > 0 || client._count.subAccounts > 0) {
      return NextResponse.json(
        {
          error: "フォルダまたは補助科目が紐づいているため削除できません",
          code: "CLIENT_HAS_RELATIONS",
          folders: client._count.folders,
          subAccounts: client._count.subAccounts,
        },
        { status: 409 }
      );
    }

    await prisma.company.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting client:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "得意先の削除に失敗しました", code: "CLIENT_DELETE_FAILED", detail },
      { status: 500 }
    );
  }
}
