import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isExternalRole } from "@/lib/roles";

/**
 * 「この人はどの得意先を見てよいか」をサーバー側で決める。
 *
 * ## なぜ要るのか
 *
 * 得意先の絞り込みはこれまで localStorage の `selectedClientId` を
 * クエリに乗せるだけで、API は渡された値をそのまま使っていた。
 * 社内の人しか居ない間はそれで成立していたが、**税理士（社外）を入れる以上、
 * クエリの clientId を信用してはいけない**。
 *
 * ## 使い方
 *
 *   const scope = await getClientScope();
 *   if (!scope) return 401;
 *   if (!isClientAllowed(scope, clientId)) return 403;
 *
 * 一覧を返すときは `whereClientScope(scope)` を where に混ぜる。
 * **社外の人には得意先の指定を許さず、担当分に強制で絞る。**
 */

export type ClientScope = {
  role: string;
  userId: string;
  /** 見てよい得意先の id。`null` は「制限なし」＝社内の人 */
  clientIds: string[] | null;
};

/**
 * 社外の人か。
 *
 * 書き込みの入口では、まずこれで断る。**税理士が仕訳を直せるようにするのは
 * 別の段階**で、そのときは「どの項目を直せるか」を絞ったうえで履歴を残す。
 * それまでは、読める＝書けるにしない。
 */
export function isExternalScope(scope: ClientScope): boolean {
  return scope.clientIds !== null;
}

/** ログインしていなければ null */
export async function getClientScope(): Promise<ClientScope | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const role = session.user.role || "";
  if (!isExternalRole(role)) {
    return { role, userId: session.user.id, clientIds: null };
  }

  const rows = await prisma.advisorClient.findMany({
    where: { userId: session.user.id },
    select: { clientId: true },
  });
  return { role, userId: session.user.id, clientIds: rows.map((r) => r.clientId) };
}

/**
 * 得意先が見てよいものか。
 *
 * **得意先が付いていないもの（clientId が null）は社外の人には見せない。**
 * 昔のフォルダには得意先が無い行があり、それが「誰のものでもない＝全員に見える」
 * ことになってはいけない。
 */
export function isClientAllowed(scope: ClientScope, clientId: string | null | undefined): boolean {
  if (scope.clientIds === null) return true;
  if (!clientId) return false;
  return scope.clientIds.includes(clientId);
}

/**
 * Prisma の where に混ぜる断片。社内の人には何も足さない。
 *
 *   where: { ...whereClientScope(scope), status: "reviewed" }
 */
export function whereClientScope(scope: ClientScope): { clientId?: { in: string[] } } {
  if (scope.clientIds === null) return {};
  return { clientId: { in: scope.clientIds } };
}

/** フォルダが見てよいものか（得意先をたどって判定する） */
export async function isFolderAllowed(scope: ClientScope, folderId: string): Promise<boolean> {
  if (scope.clientIds === null) return true;
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { clientId: true },
  });
  return !!folder && isClientAllowed(scope, folder.clientId);
}

/** 書類が見てよいものか（フォルダ → 得意先とたどる） */
export async function isDocumentAllowed(scope: ClientScope, documentId: string): Promise<boolean> {
  if (scope.clientIds === null) return true;
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { folder: { select: { clientId: true } } },
  });
  return !!doc?.folder && isClientAllowed(scope, doc.folder.clientId);
}

/**
 * 配信するファイルが見てよいものか。
 *
 * `/api/files` は id ではなくパスで引くので、パスから書類をたどる。
 *   ページ画像 … /uploads/pages/{documentId}/page_N.ext
 *   元ファイル … /uploads/{uuid}.ext（Document.filepath と一致する）
 *
 * **どちらの形にも当てはまらないパスは、社外の人には渡さない。**
 * 新しい保存先が増えたときに、素通しで漏れるより止まったほうがよい。
 */
export async function isFilePathAllowed(scope: ClientScope, filePath: string): Promise<boolean> {
  if (scope.clientIds === null) return true;

  const pageMatch = filePath.match(/^\/uploads\/pages\/([^/]+)\//);
  if (pageMatch) return isDocumentAllowed(scope, pageMatch[1]);

  const doc = await prisma.document.findFirst({
    where: { filepath: filePath },
    select: { folder: { select: { clientId: true } } },
  });
  if (!doc) return false;
  return !!doc.folder && isClientAllowed(scope, doc.folder.clientId);
}
