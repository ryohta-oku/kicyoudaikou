import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";
import { roleFromHub, type KicyouRole } from "@/lib/roles";

/**
 * ログインの照合。経路の可否判定とコールバックは auth.config.ts が持つ（ミドルウェアと共用）。
 *
 * ## 2つの経路がある
 *
 * `SHARED_LOGIN=on` のとき **client-hub に委ねる**（ここぼし・goal-compass・
 * houjin-db・seo-master と同じ形）。それ以外は従来どおりローカルの `User` で照合する。
 *
 * **スイッチを残すのは、ログインが業務の玄関だから。** 切り替えて何かおかしければ
 * VPS で `SHARED_LOGIN` を消して `pm2 restart` するだけで元に戻る。
 * デプロイのやり直しを待つ間、誰も記帳代行に入れない、という状態を作らない。
 *
 * ## 共通ログインにする理由
 *
 * 記帳代行はパスワードを**平文でも保存**していた（`User.plainPassword`）。
 * これは不始末ではなく機能で、利用者がパスワードを忘れたとき指導員が
 * 管理画面で確認して伝えるために使っている。
 *
 * client-hub は同じ必要を、平文を残さずに満たしている ―― パスワードは URL の
 * トークンと `AUTH_SECRET` から導出した鍵で AES-256-GCM 暗号化して保管し、
 * 期間限定URLで見せる。共通ログインに寄せれば、機能を落とさずに平文が消える。
 * （`plainPassword` の撤去はこの切り替えが済んでから。先に消すと
 * 従来の経路が動かなくなる）
 *
 * ## ローカルの User は影として残す
 *
 * `WorkSession.userId` / `WorkLog.userId` / `Folder.firstCheckById` が
 * `User.id` を文字列で参照している（FK は張っていない）。消すと過去の作業記録の
 * 名義が引けなくなるので、既存行は **id を維持したまま**役割と氏名だけ同期する。
 */

const CLIENT_HUB_URL = process.env.CLIENT_HUB_URL || "http://localhost:3010";
const CRM_API_KEY = process.env.CRM_API_KEY || "";
const SHARED_LOGIN = process.env.SHARED_LOGIN === "on";

/** client-hub の応答を待つ上限。ログイン画面で無限に回らないようにする */
const TIMEOUT_MS = 8000;

type HubUser = { id: string; email: string; name: string; role?: string };
type SessionUser = { id: string; email: string; name: string; role: string };

/**
 * client-hub のアカウントに対応するローカル行を用意する。
 *
 * 既存行があれば **その id を保つ**。client-hub 側の id で作り直すと、
 * 過去の `WorkLog.userId` がどのアカウントのものか引けなくなる。
 */
async function ensureLocalUser(hub: {
  id: string;
  email: string;
  name: string;
  role: KicyouRole;
}) {
  const existing =
    (await prisma.user.findUnique({ where: { id: hub.id } })) ??
    (await prisma.user.findUnique({ where: { email: hub.email } }));

  if (existing) {
    if (existing.role === hub.role && existing.name === hub.name) return existing;
    return prisma.user.update({
      where: { id: existing.id },
      data: { role: hub.role, name: hub.name },
    });
  }

  return prisma.user.create({
    data: {
      id: hub.id,
      email: hub.email,
      name: hub.name,
      /**
       * パスワードは client-hub が持つ。**ここには絶対に置かない** ――
       * 2か所にあると必ず片方が古くなる。
       * 空文字にしておけば bcrypt.compare は何を渡しても false を返すので、
       * 万一 SHARED_LOGIN を戻してもこの影のアカウントではログインできない
       */
      password: "",
      role: hub.role,
    },
  });
}

/** client-hub に照合を委ねる */
async function authorizeViaHub(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  if (!CRM_API_KEY) {
    console.error("[auth] CRM_API_KEY が未設定のため client-hub に照合できない");
    return null;
  }

  try {
    const res = await fetch(`${CLIENT_HUB_URL}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": CRM_API_KEY },
      body: JSON.stringify({
        email,
        password,
        // client-hub 側の App レジストリで、このアプリに入れる役割を絞れる
        service: "kicyoudaikou",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const hubUser = (await res.json()) as HubUser;
    if (!hubUser?.id || !hubUser.email) return null;

    const local = await ensureLocalUser({
      id: hubUser.id,
      email: hubUser.email,
      name: hubUser.name,
      role: roleFromHub(hubUser.role),
    });

    return {
      id: local.id,
      email: local.email,
      name: local.name,
      role: local.role,
    };
  } catch (error) {
    console.error("[auth] client-hub の照合に失敗", error);
    return null;
  }
}

/** 従来どおりローカルの User で照合する */
async function authorizeLocally(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  // 影として作られた行は password が空。bcrypt.compare は false を返す
  if (!user.password) return null;
  if (!(await bcrypt.compare(password, user.password))) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        return SHARED_LOGIN
          ? authorizeViaHub(email, password)
          : authorizeLocally(email, password);
      },
    }),
  ],
});
