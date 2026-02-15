/** 会社名を正規化して比較用文字列を生成 */
export function normalizeCompanyName(name: string): string {
  let s = name.trim();

  // 全角英数→半角英数
  s = s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );

  // 全角スペース→半角スペース
  s = s.replace(/　/g, " ");

  // 法人格の表記揺れを除去
  const corporateTypes = [
    "株式会社", "（株）", "(株)", "㈱",
    "有限会社", "（有）", "(有)", "㈲",
    "合同会社", "（合）", "(合)",
    "合資会社", "合名会社",
    "一般社団法人", "一般財団法人",
    "公益社団法人", "公益財団法人",
    "NPO法人", "特定非営利活動法人",
    "医療法人", "社会福祉法人",
    "学校法人", "宗教法人",
  ];
  for (const ct of corporateTypes) {
    s = s.replace(new RegExp(ct.replace(/[()（）]/g, "\\$&"), "g"), "");
  }

  // 空白除去、小文字化
  s = s.replace(/\s+/g, "").toLowerCase();

  return s;
}
