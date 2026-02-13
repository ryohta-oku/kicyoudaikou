import path from "path";

/**
 * サーバーレス環境（Vercel等）ではprocess.cwd()配下が読み取り専用のため、
 * /tmp をアップロード先として使用する。
 * ローカル開発ではpublic/uploadsを使用する。
 */
function isServerless(): boolean {
  return process.env.VERCEL === "1" || !isWritableDir(path.join(process.cwd(), "public"));
}

function isWritableDir(dir: string): boolean {
  try {
    const fs = require("fs");
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * アップロードファイルの物理保存先ディレクトリを返す
 */
export function getUploadBaseDir(): string {
  if (isServerless()) {
    return "/tmp/uploads";
  }
  return path.join(process.cwd(), "public", "uploads");
}

/**
 * DBに保存するファイルパス（/uploads/xxx）から物理パスへ変換
 */
export function toPhysicalPath(dbFilePath: string): string {
  if (isServerless()) {
    // dbFilePath: "/uploads/xxx.pdf" -> "/tmp/uploads/xxx.pdf"
    return path.join("/tmp", dbFilePath);
  }
  return path.join(process.cwd(), "public", dbFilePath);
}
