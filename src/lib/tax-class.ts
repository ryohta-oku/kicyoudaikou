/**
 * 税区分の名称を、会計ソフトごとの正式な文字列に写す。
 *
 * **3社とも「税率」は数字の列ではなく税区分の文字列で伝える。**
 * 「課対仕入込10%」の1文字列に、課税か否か・仕入か売上か・税率・税込か税抜かが
 * 全部入っている。そして3社とも、自社に登録された名称と**完全一致**しないと
 * 取り込み時に人が手で対応付ける画面が出る。CSVを出したあとに手を入れないためには、
 * ここが正確であることが要になる。
 *
 * 出典（いずれも各社の公式ページ）:
 * - 弥生会計: 課税方式別税区分・税計算区分一覧（support.yayoi-kk.co.jp page_id=18111）
 * - マネーフォワード: 登録されている税区分の一覧（biz.moneyforward.com .../service/s15.html）
 * - freee: その他の会計ソフトから仕訳データを移行する（support.freee.co.jp .../204847430）
 *
 * 前提: **税込経理・本則課税**。得意先の経理方式はいまこれで統一している。
 * 税抜経理にする場合は「込」を「内」に変え、税額欄を埋める必要がある（別途）。
 */

/** 出力先の会計ソフト */
export type CsvFormat = "generic" | "yayoi" | "mf" | "freee";

/** 仕訳のどちら側か。同じ10%でも仕入と売上で税区分名が違う */
export type EntrySide = "purchase" | "sale";

/**
 * アプリ内部での税区分。AIが返す「課税10%」等をここに寄せてから各社の名称に写す。
 *
 * `taxableOld8` は2019年9月以前の8%。いま届く領収書には出てこないが、
 * 過年度の書類を入れたときに軽減8%と取り違えないよう、値としては分けておく。
 */
export type TaxCategory =
  | "taxable10"
  | "taxableReduced8"
  | "taxableOld8"
  | "nonTaxable"
  | "outOfScope";

/**
 * インボイス（適格請求書）の区分。
 *
 * **アプリは取引日から自動判定しない。** 仕入税額控除の経過措置は割合の
 * 切り替わり日が資料によって食い違う（マネーフォワードの公式案内は
 * 「70％控除＝2026年10月1日以降」、一般に知られている法令上の区分は
 * 「2026年10月1日から50％」）。日付で決めると、どちらが正しくても
 * 黙って間違える側になる。得意先ごとの設定として画面に出し、人が選ぶ。
 */
export type InvoiceKind =
  | "適格"
  | "80%控除"
  | "70%控除"
  | "50%控除"
  | "30%控除"
  | "控除なし";

export const INVOICE_KINDS: InvoiceKind[] = [
  "適格",
  "80%控除",
  "70%控除",
  "50%控除",
  "30%控除",
  "控除なし",
];

/**
 * AIが返す税率区分の文字列を内部の値に寄せる。
 *
 * **「課税8%」は軽減税率8%として扱う。** 2019年10月以降、仕入側で8%が出るのは
 * 事実上、軽減税率（飲食料品・定期購読の新聞）だけ。旧8%として出すと
 * 会計ソフト側で税額が合わなくなる。過年度の書類だけは呼び出し側で
 * `taxableOld8` を明示すること。
 */
export function normalizeTaxCategory(raw: string): TaxCategory {
  const text = String(raw || "").replace(/\s/g, "");

  if (/不課税|対象外/.test(text)) return "outOfScope";
  if (/非課税/.test(text)) return "nonTaxable";
  // 免税（輸出免税）は経費のレシートには出てこない。万一来ても
  // 対象外として出し、確認画面で人が気づけるようにする
  if (/免税/.test(text)) return "outOfScope";
  if (/8/.test(text)) return /旧/.test(text) ? "taxableOld8" : "taxableReduced8";
  if (/10/.test(text)) return "taxable10";

  // 空・未知は対象外。消費税を勝手に付けるより、付けないほうが害が小さい
  return "outOfScope";
}

/** 相手科目（現金・未払金など）は常に対象外 */
export const COUNTER_TAX_CATEGORY: TaxCategory = "outOfScope";

type NameTable = Record<TaxCategory, string>;

/** 弥生会計。インポートの記述形式は「税区分＋税計算区分＋税率」を1文字列にしたもの */
const YAYOI: Record<EntrySide, NameTable> = {
  purchase: {
    taxable10: "課対仕入込10%",
    taxableReduced8: "課対仕入込軽減8%",
    taxableOld8: "課対仕入込8%",
    nonTaxable: "非課仕入",
    outOfScope: "対象外",
  },
  sale: {
    taxable10: "課税売上込10%",
    taxableReduced8: "課税売上込軽減8%",
    taxableOld8: "課税売上込8%",
    nonTaxable: "非課売上",
    outOfScope: "対象外",
  },
};

/** マネーフォワード クラウド会計。税率の前に半角スペースが入る点に注意 */
const MF: Record<EntrySide, NameTable> = {
  purchase: {
    taxable10: "課税仕入 10%",
    taxableReduced8: "課税仕入 (軽)8%",
    taxableOld8: "課税仕入 8%",
    nonTaxable: "非課税仕入",
    outOfScope: "対象外",
  },
  sale: {
    taxable10: "課税売上 10%",
    taxableReduced8: "課税売上 (軽)8%",
    taxableOld8: "課税売上 8%",
    nonTaxable: "非課税売上",
    outOfScope: "対象外",
  },
};

/** freee。税区分名の末尾に税率を付ける形（軽減8%は全角括弧の「8%（軽）」） */
const FREEE: Record<EntrySide, NameTable> = {
  purchase: {
    taxable10: "課対仕入10%",
    taxableReduced8: "課対仕入8%（軽）",
    taxableOld8: "課対仕入8%",
    nonTaxable: "非課仕入",
    outOfScope: "対象外",
  },
  sale: {
    taxable10: "課税売上10%",
    taxableReduced8: "課税売上8%（軽）",
    taxableOld8: "課税売上8%",
    nonTaxable: "非課売上",
    outOfScope: "対象外",
  },
};

/** 汎用形式。人が読む前提なので内部の呼び方をそのまま出す */
const GENERIC: Record<EntrySide, NameTable> = {
  purchase: {
    taxable10: "課税10%",
    taxableReduced8: "課税8%（軽減）",
    taxableOld8: "課税8%（旧）",
    nonTaxable: "非課税",
    outOfScope: "対象外",
  },
  sale: {
    taxable10: "課税10%",
    taxableReduced8: "課税8%（軽減）",
    taxableOld8: "課税8%（旧）",
    nonTaxable: "非課税",
    outOfScope: "対象外",
  },
};

const TABLES: Record<CsvFormat, Record<EntrySide, NameTable>> = {
  yayoi: YAYOI,
  mf: MF,
  freee: FREEE,
  generic: GENERIC,
};

export function taxClassName(
  category: TaxCategory,
  side: EntrySide,
  format: CsvFormat
): string {
  return TABLES[format][side][category];
}

/** 課税仕入・課税売上か（インボイスの区分を付けるのはここだけ） */
export function isTaxable(category: TaxCategory): boolean {
  return (
    category === "taxable10" ||
    category === "taxableReduced8" ||
    category === "taxableOld8"
  );
}

/**
 * 弥生会計はインボイスの区分を**税区分の文字列の末尾に付ける**。
 * 例: 「課対仕入込10%適格」「課対仕入込10%区分80%」
 *
 * freee が弥生形式で書き出すときも同じ形にしている
 * （support.freee.co.jp の「弥生会計形式の仕訳ファイルについて」）。
 */
const YAYOI_INVOICE_SUFFIX: Record<InvoiceKind, string> = {
  適格: "適格",
  "80%控除": "区分80%",
  "70%控除": "区分70%",
  "50%控除": "区分50%",
  "30%控除": "区分30%",
  控除なし: "控不",
};

export function yayoiTaxClassWithInvoice(
  category: TaxCategory,
  side: EntrySide,
  invoice: InvoiceKind | null
): string {
  const base = taxClassName(category, side, "yayoi");
  // 課税でないもの（対象外・非課税）にインボイスの区分は付かない。
  // 仕入でないものにも付けない（適格請求書は仕入税額控除のための区分）
  if (!invoice || !isTaxable(category) || side !== "purchase") return base;
  return `${base}${YAYOI_INVOICE_SUFFIX[invoice]}`;
}

/**
 * マネーフォワードはインボイスを**独立した列**（借方H・貸方P）で持つ。
 * 公式ページの表記に合わせてパーセントは全角。
 *
 * 空欄は「適格」とみなされる仕様なので、登録番号が無い領収書では
 * 必ず値を入れる（空にすると免税事業者の領収書が適格扱いになる）。
 */
export function mfInvoiceValue(
  category: TaxCategory,
  side: EntrySide,
  invoice: InvoiceKind | null
): string {
  if (!invoice || !isTaxable(category) || side !== "purchase") return "";
  return invoice.replace("%", "％");
}
