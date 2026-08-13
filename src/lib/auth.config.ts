import type { NextAuthConfig } from "next-auth";

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
     * /admin 配下はログイン必須。さらに**役割で絞る**。
     *
     * この画面（/admin/crm）は client-hub の顧客台帳を表示する。台帳には
     * 就労支援事業所「ここぼし」の利用者（氏名・A型/B型）が入っているので、
     * 記帳代行の利用者アカウント（user_a / user_b）からは見せない。
     */
    authorized({ auth, request: { nextUrl } }) {
      if (!nextUrl.pathname.startsWith("/admin")) return true;

      const isLoggedIn = !!auth?.user;
      if (!isLoggedIn) return false;

      const role = auth.user?.role;
      if (role !== "admin" && role !== "staff") {
        return Response.redirect(new URL("/", nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
