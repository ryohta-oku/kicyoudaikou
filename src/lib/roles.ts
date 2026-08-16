/**
 * 記帳代行の役割と、client-hub の役割との対応。
 *
 * **ミドルウェア（Edge）から読むので、prisma と bcrypt を持ち込まないこと。**
 * ここは文字列の定義だけを置く。
 *
 * ## 語彙を統一しないのはなぜか
 *
 * client-hub は `admin` / `staff` / `member` / `tax_advisor` の4つ。記帳代行は
 * `admin` / `instructor` / `user_a` / `user_b` / `tax_advisor` の5つ。
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
  /**
   * 税理士。**社外の人**。CSVになる前の仕訳を画面で最終確認してもらうために入る。
   * 担当の得意先しか見えない（AdvisorClient で絞る）。`/admin` には入れない。
   */
  "tax_advisor",
] as const;

export type KicyouRole = (typeof KICYOU_ROLES)[number];

/** 新規に割り当ててよい役割。B型は含めない */
export const ASSIGNABLE_ROLES: readonly KicyouRole[] = [
  "admin",
  "instructor",
  "user_a",
  "tax_advisor",
];

/**
 * 社外の人の役割。
 *
 * 見えるものを**担当の得意先だけ**に絞る対象。ここに入る役割を増やすときは、
 * `src/lib/advisor.ts` の絞り込みが効いているかを必ず確かめること。
 */
export const EXTERNAL_ROLES: readonly string[] = ["tax_advisor"];

export function isExternalRole(role: string | null | undefined): boolean {
  return !!role && EXTERNAL_ROLES.includes(role);
}

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
 *   admin       → admin        管理者
 *   staff       → instructor   指導員（全体を見る。ダブルチェックの確認役には入らない）
 *   member      → user_a       A型の利用者。作業とダブルチェックを担う
 *   tax_advisor → tax_advisor  税理士。社外の人。担当の得意先だけを見る
 *
 * **未知の値は user_a に落とす。** 逆（admin に落とす）は絶対にしない ――
 * client-hub 側に新しい役割が増えたとき、それが記帳代行の管理者権限に
 * 化けてはいけない。
 *
 * ## tax_advisor の case を消してはいけない
 *
 * 既定の落とし先が `user_a` なので、**この case が無いと税理士が
 * 「A型の利用者」になる**。社外の人が、全得意先の帳簿を編集でき、
 * ダブルチェックの担い手にもなってしまう。
 *
 * 安全側の既定（user_a）は他の未知の役割に対しては正しいが、
 * tax_advisor に対しては正しくない。hub 側に役を足すときは、
 * ここへの追記を同じ変更に含めること。
 */
export function roleFromHub(hubRole: string | null | undefined): KicyouRole {
  switch (hubRole) {
    case "admin":
      return "admin";
    case "staff":
      return "instructor";
    case "member":
      return "user_a";
    case "tax_advisor":
      return "tax_advisor";
    default:
      return "user_a";
  }
}
