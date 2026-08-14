import type { NextAuthConfig } from "next-auth";
import { ADMIN_AREA_ROLES } from "@/lib/roles";

/**
 * ミドルウェアから使える認証設定。
 *
 * **prisma と bcrypt を持ち込まないこと。** ミドルウェアは Edge ランタイムで動くので、
 * それらを import すると起動しない。実際の照合をする Credentials プロバイダは
 * auth.ts 側に置き、ここは経路の可否判定だけを持つ。
 * （ここぼし側 coco-star/src/lib/auth.config.ts と同じ形）
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
      }
      return session;
    },
    /**
     * 経路の可否判定。守るのは2種類ある。
     *
     * **① /api 配下はログイン必須。**
     * 画面だけ塞いでも、そのデータを配っている API が開いていれば意味が無い。
     * 実際 `/api/documents/[id]`（会計証憑の閲覧・書き換え・削除）や
     * `/api/clients/merge`（得意先の統合）が未認証で叩ける状態だった。
     * 役割では絞らない ―― 利用者アカウント（user_a / user_b）も
     * 作業記録などの API を正当に使うため。
     *
     * **② /admin 配下はさらに役割で絞る。**
     * /admin/crm は client-hub の顧客台帳を表示する。台帳には就労支援事業所
     * 「ここぼし」の利用者（氏名・A型/B型）が入っているので、記帳代行の
     * 利用者アカウントからは見せない。
     *
     * 通す役割は `ADMIN_AREA_ROLES`（admin / instructor）。
     * ここは以前 `admin` と **`staff`** で絞っていたが、記帳代行に `staff` は
     * 存在せず、指導員が締め出される状態だった（本番が管理者1人だけだったので
     * 表面化していない）。client-hub の語彙をそのまま持ち込んだ誤り。
     */
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl;
      const isLoggedIn = !!auth?.user;

      if (pathname.startsWith("/api")) {
        // ログイン前に叩かれる口。ここを塞ぐとログインも初期設定もできなくなる
        //   /api/auth/[...nextauth]   … NextAuth 本体
        //   /api/auth/register        … 利用者0人のときの初期管理者登録
        //   /api/auth/setup-password  … 招待リンクからのパスワード設定
        if (pathname.startsWith("/api/auth")) return true;

        if (!isLoggedIn) {
          // API にはログイン画面へのリダイレクトではなく 401 を返す。
          // fetch の呼び出し側がHTMLを受け取って解析に失敗するのを避ける
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        return true;
      }

      if (!pathname.startsWith("/admin")) return true;

      if (!isLoggedIn) return false;

      const role = auth.user?.role;
      if (!role || !ADMIN_AREA_ROLES.includes(role)) {
        return Response.redirect(new URL("/", nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
