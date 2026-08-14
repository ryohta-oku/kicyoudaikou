import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

/**
 * `/admin` と `/api` の保護。
 *
 * 最初は `/admin` だけを守ったが、**それでは足りなかった。**
 * 画面を塞いでも、そのデータを配っている API が開いていれば同じものが取れる。
 * 実際 `/api/documents/[id]`（会計証憑の閲覧・書き換え・削除）、
 * `/api/clients/merge`（得意先の統合）、`/api/accounts`（勘定科目）が
 * 未認証のまま外から叩ける状態だった。
 *
 * 除外の判断は auth.config.ts の authorized に置く（`/api/auth/*` は
 * ログイン前に必要なので通す）。matcher で除外しないのは、
 * 「どれを通すか」が1か所に書かれているほうが読み落としにくいため。
 */
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
