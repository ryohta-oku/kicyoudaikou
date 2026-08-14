import { NextResponse } from "next/server";

/**
 * 共通ログイン（client-hub に認証を委ねる）が有効かどうか。
 *
 * ## なぜガードが要るのか
 *
 * スイッチを ON にすると、照合先は client-hub になる。このとき記帳代行側に
 * 残っているアカウント操作（追加・パスワード変更・役割変更・削除）は
 * **成功したように見えて何の効果も持たない**。
 *
 * - 記帳代行で追加したアカウントは client-hub に無いのでログインできない
 * - 変えたパスワードは照合に使われない
 * - 変えた役割は次のログインで client-hub の値に上書きされる
 *
 * 「押せたのに効かない」が一番たちが悪い。**明示的に断って、どこでやるかを言う。**
 *
 * `src/lib/auth.ts` と同じ環境変数を見る。片方だけ切り替わることが無いよう、
 * 判定はこの1か所に置く。
 */
export const SHARED_LOGIN = process.env.SHARED_LOGIN === "on";

/** client-hub の管理画面。案内文に出す */
const HUB_USERS_URL = `${process.env.CLIENT_HUB_URL || ""}/users`;

/**
 * 共通ログイン中なら 409 を返す。呼び出し側は
 * `const blocked = rejectIfSharedLogin("パスワードの変更"); if (blocked) return blocked;`
 */
export function rejectIfSharedLogin(what: string) {
  if (!SHARED_LOGIN) return null;
  return NextResponse.json(
    {
      error: `${what}は Client Hub で行ってください（このアプリのアカウント情報は使われません）`,
      sharedLogin: true,
      hubUrl: HUB_USERS_URL || undefined,
    },
    { status: 409 },
  );
}
