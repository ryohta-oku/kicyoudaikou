/**
 * 記帳代行の役割と、client-hub の役割との対応。
 *
 * **ミドルウェア（Edge）から読むので、prisma と bcrypt を持ち込まないこと。**
 * ここは文字列の定義だけを置く。
 *
 * ## 語彙を統一しないのはなぜか
 *
 * client-hub は `admin` / `staff` / `member` の3つ。記帳代行は
 * `admin` / `instructor` / `user_a` / `user_b` の4つ。
 *
 * 揃えたくなるが、揃えない。記帳代行の語彙は**業務上の意味**を持っていて、
 * `user_a` は「A型の利用者」でありダブルチェックの担い手を指す。これを `member`
 * に潰すと、ダブルチェックの条件（作業者と確認者が別人か）を書いている
 * 19ファイル・88箇所が意味を失う。
 *
 * 代わりに**境界で写す**。client-hub は「社内で誰が何をしてよいか」の唯一の源で、
 * 記帳代行は自分の語彙でそれを受け取る。
 */

export const KICYOU_ROLES = [
  "admin",
  "instructor",
  "user_a",
  /**
   * 2026-09-01 に AB多機能 → A型のみになったので、新規には割り当てない。
   * 既存アカウントが残っているので値としては生かしておく
   */
  "user_b",
] as const;

export type KicyouRole = (typeof KICYOU_ROLES)[number];

/** 新規に割り当ててよい役割。B型は含めない */
export const ASSIGNABLE_ROLES: readonly KicyouRole[] = [
  "admin",
  "instructor",
  "user_a",
];

/**
 * `/admin` に入れる役割。
 *
 * ここは以前 `admin` と **`staff`** で絞っていたが、記帳代行に `staff` は存在せず、
 * 指導員が締め出される状態だった（本番は管理者1人だけだったので表面化していない）。
 * client-hub の語彙をそのまま持ち込んだ誤り。
 */
export const ADMIN_AREA_ROLES: readonly string[] = ["admin", "instructor"];

export function isKicyouRole(value: unknown): value is KicyouRole {
  return (
    typeof value === "string" && (KICYOU_ROLES as readonly string[]).includes(value)
  );
}

/**
 * client-hub の役割を記帳代行の役割に写す。
 *
 *   admin  → admin       管理者
 *   staff  → instructor  指導員（全体を見る。ダブルチェックの確認役には入らない）
 *   member → user_a      A型の利用者。作業とダブルチェックを担う
 *
 * **未知の値は user_a に落とす。** 逆（admin に落とす）は絶対にしない ――
 * client-hub 側に新しい役割が増えたとき、それが記帳代行の管理者権限に
 * 化けてはいけない。
 */
export function roleFromHub(hubRole: string | null | undefined): KicyouRole {
  switch (hubRole) {
    case "admin":
      return "admin";
    case "staff":
      return "instructor";
    case "member":
      return "user_a";
    default:
      return "user_a";
  }
}
