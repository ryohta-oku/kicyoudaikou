/**
 * 税理士（社外）に「見えてはいけないものが見えない」ことを確かめる。
 *
 *   npm run check:advisor
 *
 * ## なぜ人の目視ではなく機械で見るのか
 *
 * ここは**足りないものが画面に出ない**種類の境界。担当外の得意先が1件も
 * 見えていないことは、画面を眺めても「そもそも無いのか」「隠れているのか」が
 * 区別できない。だから、見えてはいけないものを**わざと作って**から確かめる。
 *
 * 検証用に作った行は最後に必ず消す。途中で落ちた場合も後片付けする。
 *
 * ローカルの開発用DBに対して実行すること。本番では実行しない。
 */
import { prisma } from "@/lib/prisma";
import {
  whereClientScope,
  isClientAllowed,
  isFolderAllowed,
  isDocumentAllowed,
  isFilePathAllowed,
  type ClientScope,
} from "@/lib/advisor";
import { isAllowedForExternal, isViewingAsAdvisor } from "@/lib/auth.config";
import { VIEW_COOKIE, VIEW_AS_ADVISOR } from "@/lib/roles";
import { roleFromHub, isExternalRole, ADMIN_AREA_ROLES } from "@/lib/roles";

const TMP_FOLDER = "check-advisor-folder";
const TMP_DOC = "check-advisor-doc";
const TMP_FILE = "/uploads/check-advisor-secret.jpg";

let ng = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) ng++;
  console.log(
    `${ok ? "  OK  " : "  NG  "} ${name}` +
      (ok ? "" : ` → ${JSON.stringify(actual)} （期待: ${JSON.stringify(expected)}）`)
  );
}

async function cleanup() {
  await prisma.document.deleteMany({ where: { id: TMP_DOC } });
  await prisma.folder.deleteMany({ where: { id: TMP_FOLDER } });
}

/** ① client-hub の役割 → 記帳代行の役割 */
function checkRoleMapping() {
  console.log("\n=== ① 役割の写し ===");
  check("admin → admin", roleFromHub("admin"), "admin");
  check("staff → instructor", roleFromHub("staff"), "instructor");
  check("member → user_a", roleFromHub("member"), "user_a");
  // ここが落ちると、社外の人がA型利用者の全権限を持つ
  check("tax_advisor → tax_advisor", roleFromHub("tax_advisor"), "tax_advisor");

  for (const v of ["superuser", "owner", "ADMIN", "tax-advisor", "", null, undefined]) {
    check(`未知の値 ${JSON.stringify(v)} は user_a に落ちる`, roleFromHub(v as string), "user_a");
  }
  check("税理士は /admin に入れない", ADMIN_AREA_ROLES.includes("tax_advisor"), false);
  check("税理士は社外あつかい", isExternalRole("tax_advisor"), true);
  check("利用者は社外あつかいにしない", isExternalRole("user_a"), false);
}

/** ② 通す口・断る口 */
function checkGate() {
  console.log("\n=== ② 社外の人に通す口 ===");
  for (const p of ["/api/folders", "/api/folders/abc", "/api/documents/abc", "/api/files", "/api/accounts"]) {
    check(`GET ${p} は通す`, isAllowedForExternal("GET", p), true);
  }
  // 税理士がその場で直す口。項目を絞り、履歴を残す専用のもの
  check("PATCH /api/review/entry は通す", isAllowedForExternal("PATCH", "/api/review/entry"), true);
  check("POST /api/review/entries は通す", isAllowedForExternal("POST", "/api/review/entries"), true);

  console.log("\n=== ② 断る口 ===");
  const denied: [string, string][] = [
    ["POST", "/api/folders"],
    ["PATCH", "/api/folders/abc"],
    ["DELETE", "/api/folders/abc"],
    ["PATCH", "/api/documents/abc"],
    ["DELETE", "/api/documents/abc"],
    /*
      **`/api/entries` は絶対に通さない。** あちらは渡された項目をそのまま
      prisma に流すので、`isConfirmed` でも `documentId` でも書き換えられる。
      税理士が直すのは `/api/review/entry`（項目を名指しで受け、履歴を残す）だけ。
    */
    ["PATCH", "/api/entries"],
    ["POST", "/api/entries"],
    ["DELETE", "/api/entries"],
    ["POST", "/api/classify"],
    ["POST", "/api/upload"],
    ["PATCH", "/api/ocr/pages"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/admin/advisor-clients"],
    ["GET", "/api/worklogs"],
    ["GET", "/api/clients"],
    ["GET", "/api/documents"],
    ["GET", "/api/folders/abc/mismatches"],
    ["GET", "/api/accounts/sub/pending"],
  ];
  for (const [m, p] of denied) {
    check(`${m} ${p} は断る`, isAllowedForExternal(m, p), false);
  }
}

/** ②' 兼任（事業所の人が「税理士として操作」する）の切り替え条件 */
function checkAdvisorHat() {
  console.log("\n=== ②' 兼任の切り替えが効く相手 ===");
  const 立っている = { get: (n: string) => (n === VIEW_COOKIE ? { value: VIEW_AS_ADVISOR } : undefined) };
  const 無し = { get: () => undefined };

  check("管理者は切り替えられる", isViewingAsAdvisor("admin", 立っている), true);
  check("指導者は切り替えられる", isViewingAsAdvisor("instructor", 立っている), true);
  // 利用者に効かせない。効かせると、戻す画面にも入れず自力で抜け出せなくなる
  check("利用者には効かない", isViewingAsAdvisor("user_a", 立っている), false);
  check("旧B型にも効かない", isViewingAsAdvisor("user_b", 立っている), false);
  check("役割が空なら効かない", isViewingAsAdvisor("", 立っている), false);
  check("cookie が無ければ効かない", isViewingAsAdvisor("admin", 無し), false);
  check(
    "別の値なら効かない",
    isViewingAsAdvisor("admin", { get: () => ({ value: "なにか別の値" }) }),
    false
  );
}

/** ③ 得意先の判定（純粋な部分） */
function checkClientPredicate() {
  console.log("\n=== ③ 得意先の判定 ===");
  const 社内: ClientScope = { role: "instructor", userId: "u1", clientIds: null };
  const 税理士: ClientScope = { role: "tax_advisor", userId: "u2", clientIds: ["c1"] };

  check("社内はどの得意先も見える", isClientAllowed(社内, "c9"), true);
  check("社内は得意先なしも見える", isClientAllowed(社内, null), true);
  check("税理士は担当が見える", isClientAllowed(税理士, "c1"), true);
  check("税理士は担当外が見えない", isClientAllowed(税理士, "c9"), false);
  // 「誰のものでもない＝全員に見える」にしない
  check("税理士は得意先なしが見えない", isClientAllowed(税理士, null), false);
  check("担当ゼロなら何も見えない", isClientAllowed({ ...税理士, clientIds: [] }, "c1"), false);
  check("where: 社内は素通し", whereClientScope(社内), {});
  check("where: 税理士は担当分に絞る", whereClientScope(税理士), { clientId: { in: ["c1"] } });
}

/** ④ 実データ ―― 見えてはいけないものを作って確かめる */
async function checkAgainstRealData() {
  console.log("\n=== ④ 見えてはいけないものが見えないか（実データ） ===");

  const clients = await prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (clients.length < 2) {
    console.log("  -- 得意先が2件未満のため省略（担当外を作れない）");
    return;
  }
  const [担当, 担当外] = clients;

  await cleanup();
  await prisma.folder.create({
    data: { id: TMP_FOLDER, name: "★担当外のフォルダ（確認用）", clientId: 担当外.id, updatedAt: new Date() },
  });
  await prisma.document.create({
    data: {
      id: TMP_DOC, folderId: TMP_FOLDER, filename: "担当外の領収書.jpg",
      filepath: TMP_FILE, fileType: "jpeg", status: "reviewed", updatedAt: new Date(),
    },
  });

  const scope: ClientScope = { role: "tax_advisor", userId: "check-advisor", clientIds: [担当.id] };
  const 社内: ClientScope = { role: "instructor", userId: "check-office", clientIds: null };

  const 見えるフォルダ = await prisma.folder.findMany({ where: whereClientScope(scope), select: { id: true } });
  check("一覧に出ない", 見えるフォルダ.some((f) => f.id === TMP_FOLDER), false);
  check("フォルダIDを直接指定しても弾く", await isFolderAllowed(scope, TMP_FOLDER), false);
  check("書類IDを直接指定しても弾く", await isDocumentAllowed(scope, TMP_DOC), false);
  check("証憑ファイルのURLを直接叩いても弾く", await isFilePathAllowed(scope, TMP_FILE), false);
  check("知らない形のパスは渡さない", await isFilePathAllowed(scope, "/uploads/どこか/別.jpg"), false);

  console.log("\n  -- 絞りすぎていないこと --");
  check("社内はフォルダが見える", await isFolderAllowed(社内, TMP_FOLDER), true);
  check("社内は書類が見える", await isDocumentAllowed(社内, TMP_DOC), true);
  check("社内は証憑が見える", await isFilePathAllowed(社内, TMP_FILE), true);

  await cleanup();
  check("確認用の行を消した", await prisma.folder.count({ where: { id: TMP_FOLDER } }), 0);
}

async function main() {
  checkRoleMapping();
  checkGate();
  checkAdvisorHat();
  checkClientPredicate();
  await checkAgainstRealData();

  console.log(
    ng === 0 ? "\n✅ すべて期待どおり" : `\n❌ ${ng} 件が期待と違う ―― 社外の人に見えてはいけないものが見える恐れがある`
  );
  await prisma.$disconnect();
  process.exit(ng === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
