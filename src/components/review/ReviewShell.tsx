"use client";

import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Eye, ArrowLeft, FileCheck2, LogOut } from "lucide-react";
import { VIEW_COOKIE } from "@/lib/roles";

/**
 * 税理士の確認画面の外枠。
 *
 * 事業所のナビ（ダッシュボード・工数管理・得意先管理…）は**出さない**。
 * 税理士さんに要るのは確認する書類だけで、他を見せると迷わせる。
 *
 * ## 出口は必ずヘッダーに置く
 *
 * 以前は「事業所に戻る」を**紺色の帯の中にだけ**置いていた。
 * ところがあの帯は「税理士として操作」に切り替えているときしか出ない。
 *
 * 事業所の管理者は、切り替えていなくてもこの画面を開ける
 * （担当の絞り込みが無いので、全部のフォルダが見える）。そのとき帯が出ず、
 * ナビも消してあるので、**ブラウザの戻る以外に帰り道が無くなっていた**。
 *
 * 本物の税理士にも同じ問題があり、ログアウトする手段がどこにも無かった。
 *
 * **どちらの立場でも、ヘッダーだけ見れば出口がある**状態にする。
 */
export default function ReviewShell({
  children,
  previewName,
  actingAsAdvisor,
  canReturnToOffice,
  userName,
}: {
  children: React.ReactNode;
  /** `?as=` で他の税理士の目線を見ているとき、その名前 */
  previewName?: string;
  /** 事業所の人が「税理士として操作」しているか */
  actingAsAdvisor: boolean;
  /** 事業所の人（管理者・指導者）か。**切り替えの有無にかかわらず戻り道を出す** */
  canReturnToOffice: boolean;
  /** いま見ている人の名前。どの立場で見ているのかの手がかりになる */
  userName?: string;
}) {
  const router = useRouter();

  const backToOffice = () => {
    // cookie を消すだけで戻る。管理画面を通らなくてよい（そこには入れないため）
    document.cookie = `${VIEW_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white/80 backdrop-blur border-b border-teal-100">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <FileCheck2 className="w-6 h-6 text-teal-600 shrink-0" />
          <span className="font-black text-foreground">記帳代行ツール</span>
          <span className="text-sm text-gray-500">仕訳の確認</span>

          <div className="ml-auto flex items-center gap-2">
            {userName && (
              <span className="hidden sm:inline text-sm text-gray-600">{userName}</span>
            )}
            {canReturnToOffice ? (
              <button
                onClick={backToOffice}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                事業所の画面に戻る
              </button>
            ) : (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                ログアウト
              </button>
            )}
          </div>
        </div>
      </header>

      {previewName && (
        <div className="bg-gray-800 text-white">
          <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-2 text-sm">
            <Eye className="w-4 h-4 shrink-0" />
            <span>
              これは <strong>{previewName}</strong> に見えている画面です（プレビュー・操作はできません）
            </span>
          </div>
        </div>
      )}

      {/*
        いまどの立場で操作しているかの断り書き。
        **戻るボタンはもう置かない** ―― ヘッダーに常にあるので、
        同じ役目のボタンが2つ並ぶと、どちらを押すのか迷わせる。
      */}
      {actingAsAdvisor && !previewName && (
        <div className="bg-indigo-700 text-white">
          <div className="max-w-7xl mx-auto px-4 py-2.5 text-sm">
            <strong>税理士として操作しています。</strong>
            記録には「（税理士として）」と残ります。
          </div>
        </div>
      )}

      {/*
        切り替えずに開いている事業所の人には、ここが何の画面かを言っておく。
        担当の絞り込みが効いていない（全部見えている）ことも伝える ――
        「税理士にはこう見えている」と誤解したまま確認すると、意味が無い。
      */}
      {canReturnToOffice && !actingAsAdvisor && !previewName && (
        <div className="bg-amber-100 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 py-2.5 text-sm text-amber-900">
            <strong>事業所の立場で見ています。</strong>
            この画面からの確認・差し戻しはできません。税理士さんと同じ操作を試すときは、
            ダッシュボードの「税理士として確認」から入ってください。
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
