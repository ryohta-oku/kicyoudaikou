import Link from "next/link";
import { redirect } from "next/navigation";
import { FolderCheck, Inbox } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getClientScope, whereClientScope, type ClientScope } from "@/lib/advisor";
import { ADMIN_AREA_ROLES } from "@/lib/roles";
import { auth } from "@/lib/auth";
import ReviewShell from "@/components/review/ReviewShell";

export const metadata = { title: "確認する書類 | 記帳代行ツール" };

/**
 * 税理士さんの入口。確認をお願いされているフォルダを並べる。
 *
 * **サーバーコンポーネントにしている理由**は、読み込みをサーバーでやっておかないと
 * 「この税理士として見る」（?as=）が成立しないため。表示だけをここで組み立て、
 * 操作は client component に渡す。
 */

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "確認をお願いしています", className: "bg-amber-100 text-amber-800" },
  returned: { label: "差し戻し済み", className: "bg-red-100 text-red-700" },
  approved: { label: "確認済み", className: "bg-green-100 text-green-700" },
};

export default async function ReviewIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const { as } = await searchParams;
  const scope = await getClientScope();
  if (!scope) redirect("/login");
  const userName = (await auth())?.user?.name || undefined;

  // ?as= は「この税理士には何が見えているか」を確かめるためのもの（読み取り専用）
  const preview = await resolvePreview(scope, as);
  const effective = preview?.scope ?? scope;

  const folders = await prisma.folder.findMany({
    where: {
      ...whereClientScope(effective),
      taxReviewStatus: { not: null },
    },
    select: {
      id: true,
      name: true,
      taxReviewStatus: true,
      client: { select: { name: true } },
      _count: { select: { documents: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <ReviewShell
      previewName={preview?.name}
      actingAsAdvisor={!!effective.actingAsAdvisor}
      /* 切り替えの有無にかかわらず、事業所の人には戻り道を出す */
      canReturnToOffice={ADMIN_AREA_ROLES.includes(scope.role)}
      userName={userName}
    >
      <h1 className="text-2xl font-black text-foreground mb-1">確認する書類</h1>
      <p className="text-sm text-gray-600 mb-6">
        事業所から確認をお願いされている分です。上から順に見ていってください。
      </p>

      {folders.length === 0 ? (
        <div className="card-glass rounded-xl p-10 text-center">
          <Inbox className="w-10 h-10 text-teal-300 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">いま確認をお願いしている書類はありません</p>
          <p className="text-sm text-gray-500 mt-1">
            {effective.clientIds?.length === 0
              ? "担当の得意先がまだ設定されていません。事業所にご連絡ください。"
              : "新しく依頼があると、ここに出ます。"}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {folders.map((f) => {
            const s = f.taxReviewStatus ? STATUS_LABEL[f.taxReviewStatus] : null;
            return (
              <li key={f.id}>
                <Link
                  href={preview ? `/review/${f.id}?as=${preview.userId}` : `/review/${f.id}`}
                  className="card-glass rounded-xl p-4 flex items-center gap-4 hover:bg-teal-50/60 transition-colors"
                >
                  <FolderCheck className="w-6 h-6 text-teal-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-foreground truncate">{f.name}</p>
                    <p className="text-sm text-gray-500">
                      {f.client?.name ?? "得意先なし"} ・ {f._count.documents} 件の書類
                    </p>
                  </div>
                  {s && (
                    <span className={`text-xs px-2.5 py-1 rounded-full shrink-0 ${s.className}`}>
                      {s.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ReviewShell>
  );
}

/**
 * `?as=` の解決。**admin / instructor のときだけ**受け付ける。
 *
 * 渡した人の権限は漏らさない ―― その税理士の担当得意先でスコープを組み直し、
 * 同じ判定関数に通す。
 */
export async function resolvePreview(
  scope: Awaited<ReturnType<typeof getClientScope>>,
  as: string | undefined
) {
  if (!as || !scope) return null;
  if (!["admin", "instructor"].includes(scope.role)) return null;
  // 自分が税理士として操作している最中は、他人の目線に切り替えない（混乱するだけ）
  if (scope.clientIds !== null) return null;

  const target = await prisma.user.findUnique({
    where: { id: as },
    select: { id: true, name: true },
  });
  if (!target) return null;

  const rows = await prisma.advisorClient.findMany({
    where: { userId: target.id },
    select: { clientId: true },
  });

  const previewScope: ClientScope = {
    role: scope.role,
    userId: target.id,
    clientIds: rows.map((r) => r.clientId),
    // プレビューは読み取り専用。押せるものが無いので、記録の立場は関係ない
    actingAsAdvisor: false,
  };

  return { userId: target.id, name: target.name, scope: previewScope };
}

export const dynamic = "force-dynamic";
