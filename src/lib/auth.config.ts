import type { NextAuthConfig } from "next-auth";
import { ADMIN_AREA_ROLES, isExternalRole, VIEW_COOKIE, VIEW_AS_ADVISOR } from "@/lib/roles";

/**
 * 社外の人（税理士）に通してよい API。**ここに無いものは全部断る。**
 *
 * 逆（危ないものを列挙して塞ぐ）にしない。ルートは40近くあり、
 * これから増える。増えたものが既定で開くか閉じるかの違いは大きい。
 *
 * 得意先の絞り込みはここではできない（Edge なので prisma を持ち込めない）。
 * **各ルートの中で `@/lib/advisor` を使って持ち主を確かめること。**
 * ここが見るのは「経路と方式」だけ。
 */
const EXTERNAL_ALLOWED: { method: string; pattern: RegExp }[] = [
  // 確認画面が読むもの
  { method: "GET", pattern: /^\/api\/folders$/ },
  { method: "GET", pattern: /^\/api\/folders\/[^/]+$/ },
  { method: "GET", pattern: /^\/api\/documents\/[^/]+$/ },
  { method: "GET", pattern: /^\/api\/files$/ },
  { method: "GET", pattern: /^\/api\/accounts$/ },
  // 自分のアカウント情報（画面右上の表示に使う）
  { method: "GET", pattern: /^\/api\/account$/ },
  // 確認の記録（1仕訳ごとの「よい」「直して」）
  { method: "POST", pattern: /^\/api\/review\/entries$/ },
];

/** 経路と方式だけの判定。**export しているのは、境界を単体で確かめられるようにするため。** */
export function isAllowedForExternal(method: string, pathname: string): boolean {
  return EXTERNAL_ALLOWED.some((r) => r.method === method && r.pattern.test(pathname));
}

/**
 * 「税理士として操作」に切り替えているか。
 *
 * **管理者・指導者のときだけ効かせる。** 誰にでも効かせると、利用者さんが
 * 何かの拍子にこの cookie を持ったとき、切り替えを戻す画面にも入れず
 * 自力で抜け出せなくなる。兼任を使うのは管理側の人だけなので、そこに絞る。
 *
 * 権限が増えることはない ―― これが真になっても、見えるのは自分に
 * 割り当てられた得意先だけ（＝制限される側にしか動かない）。
 */
export function isViewingAsAdvisor(
  role: string | null | undefined,
  cookies: { get(name: string): { value: string } | undefined }
): boolean {
  if (!role || !ADMIN_AREA_ROLES.includes(role)) return false;
  return cookies.get(VIEW_COOKIE)?.value === VIEW_AS_ADVISOR;
}

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
     * 経路の可否判定。守るのは3種類ある。
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
     *
     * **③ 社外の人（税理士）は許可した口だけ。**
     * ①は「ログインしていれば通す」なので、社外の人が入ると全ての API に
     * 手が届いてしまう。`EXTERNAL_ALLOWED` に挙げた経路と方式だけを通し、
     * 残りは 403 で断る。**塞ぐものを挙げるのではなく、通すものを挙げる。**
     *
     * ここで見られるのは経路と方式まで。「その得意先を見てよいか」は
     * prisma が要るので各ルートの中（`@/lib/advisor`）で確かめる。
     */
    authorized({ auth, request }) {
      const { nextUrl } = request;
      const { pathname } = nextUrl;
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role;

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

        /*
          ③ 社外の人（税理士）は、確認画面が要る口だけ。それ以外は全部断る。

          事業所の人が「税理士として操作」に切り替えているときも同じ扱いにする。
          **確かめたいのは本物と同じ制限下での動き**なので、見た目だけ寄せて
          中身が緩い、という状態を作らない。

          cookie を信じてよいのは、これが**制限する方向にしか効かない**から。
          管理者が自分で立てても、自分の手を狭めるだけで何も増えない。
        */
        const asAdvisor = isExternalRole(role) || isViewingAsAdvisor(role, request.cookies);

        if (asAdvisor && !isAllowedForExternal(request.method, pathname)) {
          return new Response(JSON.stringify({ error: "forbidden", code: "EXTERNAL_ROLE_DENIED" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        return true;
      }

      if (!pathname.startsWith("/admin")) return true;

      if (!isLoggedIn) return false;

      /*
        税理士として操作している間は、管理画面にも入れない（本物と同じ）。
        戻るのは cookie を消すだけなので、この画面を通らなくてよい
        （画面上部のバナーの「事業所に戻る」がそれをする）。
      */
      if (isViewingAsAdvisor(role, request.cookies)) {
        return Response.redirect(new URL("/review", nextUrl));
      }

      if (!role || !ADMIN_AREA_ROLES.includes(role)) {
        return Response.redirect(new URL("/", nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
