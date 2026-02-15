import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }) };
  }
  if (session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "管理者権限が必要です" }, { status: 403 }) };
  }
  return { session };
}

function getEnvPath() {
  return join(process.cwd(), ".env");
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  return NextResponse.json({ inviteCode: process.env.INVITE_CODE || "" });
}

export async function PUT(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { inviteCode } = await request.json();

    if (!inviteCode || inviteCode.trim() === "") {
      return NextResponse.json({ error: "招待コードを入力してください" }, { status: 400 });
    }

    const newCode = inviteCode.trim();

    // .env ファイルを更新
    const envPath = getEnvPath();
    let envContent = await readFile(envPath, "utf-8");

    if (envContent.includes("INVITE_CODE=")) {
      envContent = envContent.replace(/INVITE_CODE=.*/, `INVITE_CODE="${newCode}"`);
    } else {
      envContent += `\nINVITE_CODE="${newCode}"\n`;
    }

    await writeFile(envPath, envContent, "utf-8");

    // ランタイムの環境変数も更新
    process.env.INVITE_CODE = newCode;

    return NextResponse.json({ success: true, inviteCode: newCode });
  } catch (err) {
    console.error("Invite code update error:", err);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
