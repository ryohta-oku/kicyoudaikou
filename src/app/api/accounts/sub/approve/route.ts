import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

async function requireAdminOrInstructor() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (session.user.role !== "admin" && session.user.role !== "instructor") {
    return { error: NextResponse.json({ error: "管理者または指導者権限が必要です" }, { status: 403 }) };
  }
  return { session };
}

// 承認
export async function PATCH(request: NextRequest) {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    const subAccount = await prisma.subAccount.update({
      where: { id },
      data: { isApproved: true },
    });

    return NextResponse.json({ subAccount });
  } catch (err) {
    console.error("Error approving sub account:", err);
    return NextResponse.json({ error: "承認に失敗しました" }, { status: 500 });
  }
}

// 却下（削除）
export async function DELETE(request: NextRequest) {
  const { error } = await requireAdminOrInstructor();
  if (error) return error;

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "IDは必須です" }, { status: 400 });
    }

    await prisma.subAccount.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error rejecting sub account:", err);
    return NextResponse.json({ error: "却下に失敗しました" }, { status: 500 });
  }
}
