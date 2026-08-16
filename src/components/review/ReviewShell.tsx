"use client";

import { useRouter } from "next/navigation";
import { Eye, ArrowLeft, FileCheck2 } from "lucide-react";
import { VIEW_COOKIE } from "@/lib/roles";

/**
 * 税理士の確認画面の外枠。
 *
 * 事業所のナビ（ダッシュボード・工数管理・得意先管理…）は**出さない**。
 * 税理士さんに要るのは確認する書類だけで、他を見せると迷わせる。
 *
 * いまどの立場で見ているのかを、画面から離れない位置に出し続ける。
 */
export default function ReviewShell({
  children,
  previewName,
  actingAsAdvisor,
}: {
  children: React.ReactNode;
  /** `?as=` で他の税理士の目線を見ているとき、その名前 */
  previewName?: string;
  /** 事業所の人が「税理士として操作」しているか */
  actingAsAdvisor: boolean;
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
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-2">
          <FileCheck2 className="w-6 h-6 text-teal-600" />
          <span className="font-black text-foreground">記帳代行ツール</span>
          <span className="text-sm text-gray-500">仕訳の確認</span>
        </div>
      </header>

      {previewName && (
        <div className="bg-gray-800 text-white">
          <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-2 text-sm">
            <Eye className="w-4 h-4 shrink-0" />
            <span>
              これは <strong>{previewName}</strong> に見えている画面です（プレビュー・操作はできません）
            </span>
          </div>
        </div>
      )}

      {actingAsAdvisor && !previewName && (
        <div className="bg-indigo-700 text-white">
          <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>
              <strong>税理士として操作しています。</strong>
              記録には「（税理士として）」と残ります。
            </span>
            <button
              onClick={backToOffice}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              事業所に戻る
            </button>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
