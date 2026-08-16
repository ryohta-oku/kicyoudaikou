/**
 * 説明書に載せる線画。
 *
 * **写真が用意できるまでのつなぎ**として描いている。実機の写真が届いたら
 * ここを差し替えれば、他は触らなくてよい形にしてある。
 *
 * 初めての人がいちばん間違えるのは「紙の向き」と「どこにセットするか」。
 * 文字で「おもて面を下」と書いても伝わりにくいので、絵で示す。
 *
 * 色は CSS 変数ではなく Tailwind の teal/amber に合わせた実値を使う。
 * SVG の中では Tailwind のクラスが効かない部分があるため。
 */

const LINE = "#334155"; // slate-700 相当。線画の主線
const TEAL = "#0d9488";
const AMBER = "#f59e0b";
const PAPER = "#ffffff";
const SHADE = "#f1f5f9";

/** 図に添える短い説明。読み上げにも使う */
function Caption({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-600 mt-2 text-center">{children}</p>;
}

/**
 * ① 給紙カバーを開けて電源を入れる。
 * iX2500 は給紙カバーと電源が連動しているので、ここが「電源を入れる」に当たる。
 */
export function FigureOpenCover() {
  return (
    <figure>
      <svg viewBox="0 0 320 200" role="img" aria-label="給紙カバーを手前に開くと電源が入る図" className="w-full h-auto">
        {/* 本体 */}
        <rect x="60" y="120" width="200" height="55" rx="8" fill={SHADE} stroke={LINE} strokeWidth="2.5" />
        {/* 開いた給紙カバー */}
        <path d="M78 120 L108 58 L232 58 L262 120 Z" fill={PAPER} stroke={LINE} strokeWidth="2.5" strokeLinejoin="round" />
        {/* 開く動きの矢印 */}
        <path d="M150 108 Q150 74 178 66" fill="none" stroke={TEAL} strokeWidth="4" strokeLinecap="round" />
        <path d="M178 66 l-13 -1 l7 11 z" fill={TEAL} />
        {/* 電源が入った合図 */}
        <circle cx="240" cy="147" r="7" fill={TEAL} />
        <text x="240" y="172" fontSize="12" textAnchor="middle" fill={TEAL} fontWeight="700">電源ON</text>
      </svg>
      <Caption>
        カバーを手前に開けるだけで電源が入ります。スイッチはありません。
      </Caption>
    </figure>
  );
}

/**
 * ② 紙の向き。**この図がこの説明書でいちばん大事。**
 *
 * ScanSnap は上から下へ紙を送るので、読みたい面を下にして、
 * 文字の上のほうが先に入るようにセットする。
 */
export function FigurePaperDirection() {
  return (
    <figure>
      <svg viewBox="0 0 320 210" role="img" aria-label="レシートのおもて面を下に向け、文字の上のほうが先に入るようにセットする図" className="w-full h-auto">
        {/* 給紙口 */}
        <rect x="55" y="150" width="210" height="42" rx="6" fill={SHADE} stroke={LINE} strokeWidth="2.5" />
        <line x1="70" y1="150" x2="250" y2="150" stroke={LINE} strokeWidth="2.5" />

        {/* レシート（裏返して差している状態） */}
        <g>
          <rect x="112" y="30" width="96" height="118" rx="3" fill={PAPER} stroke={LINE} strokeWidth="2.5" />
          {/* 裏面なので文字は薄く（透けて見えている表現） */}
          <g opacity="0.28">
            <line x1="126" y1="132" x2="194" y2="132" stroke={LINE} strokeWidth="3" />
            <line x1="126" y1="120" x2="176" y2="120" stroke={LINE} strokeWidth="3" />
            <line x1="126" y1="108" x2="186" y2="108" stroke={LINE} strokeWidth="3" />
            <line x1="126" y1="52" x2="194" y2="52" stroke={LINE} strokeWidth="5" />
          </g>
          <text x="160" y="92" fontSize="13" textAnchor="middle" fill={LINE} fontWeight="700">うら</text>
          <text x="160" y="110" fontSize="11" textAnchor="middle" fill={LINE}>が見える</text>
        </g>

        {/* 送られる向き */}
        <path d="M160 150 L160 176" fill="none" stroke={TEAL} strokeWidth="4" strokeLinecap="round" />
        <path d="M160 182 l-7 -12 h14 z" fill={TEAL} />

        {/* 上端が先に入ることを示す印 */}
        <g>
          <rect x="112" y="138" width="96" height="10" fill={AMBER} opacity="0.85" />
          <text x="240" y="145" fontSize="12" fill="#b45309" fontWeight="700">文字の上がわ</text>
          <text x="240" y="160" fontSize="12" fill="#b45309" fontWeight="700">を下にする</text>
          <path d="M232 141 L212 143" stroke="#b45309" strokeWidth="2" />
        </g>

        <text x="160" y="22" fontSize="12" textAnchor="middle" fill={LINE}>レシートの下がわ（合計の側）が上</text>
      </svg>
      <Caption>
        <strong className="text-foreground">読みたい面を下</strong>にします。
        手前から見て「うら」が見えていれば合っています。
      </Caption>
    </figure>
  );
}

/**
 * ③ レシートガイドの3つの入れ口。
 * 幅の違うレシートを同時にセットできるのが、この道具の要点。
 */
export function FigureReceiptGuide() {
  return (
    <figure>
      <svg viewBox="0 0 320 190" role="img" aria-label="名刺・レシートガイドの3つの入れ口の図" className="w-full h-auto">
        <rect x="30" y="40" width="260" height="120" rx="8" fill={SHADE} stroke={LINE} strokeWidth="2.5" />

        {/* 細い入れ口（58mm） */}
        <rect x="48" y="58" width="52" height="84" rx="3" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <text x="74" y="104" fontSize="11" textAnchor="middle" fill={LINE}>ほそい</text>
        <text x="74" y="156" fontSize="11" textAnchor="middle" fill={TEAL} fontWeight="700">58mm</text>

        {/* 中くらい（83mm） */}
        <rect x="116" y="58" width="74" height="84" rx="3" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <text x="153" y="104" fontSize="11" textAnchor="middle" fill={LINE}>ふつう</text>
        <text x="153" y="156" fontSize="11" textAnchor="middle" fill={TEAL} fontWeight="700">83mm</text>

        {/* 広い（148〜216mm） */}
        <rect x="206" y="58" width="66" height="84" rx="3" fill={PAPER} stroke={LINE} strokeWidth="2" />
        <text x="239" y="98" fontSize="11" textAnchor="middle" fill={LINE}>ひろい</text>
        <text x="239" y="112" fontSize="10" textAnchor="middle" fill={LINE}>（A4など）</text>
        <text x="239" y="156" fontSize="11" textAnchor="middle" fill={TEAL} fontWeight="700">148mm〜</text>

        <text x="160" y="28" fontSize="12" textAnchor="middle" fill={LINE}>幅ちがいを同時に入れられます</text>
      </svg>
      <Caption>
        ガイドを付けると、<strong className="text-foreground">幅の違うレシートを一度に</strong>スキャンできます。
      </Caption>
    </figure>
  );
}

/** ④ やってはいけない紙の状態 */
export function FigureBadPaper() {
  const items: { label: string; draw: React.ReactNode }[] = [
    {
      label: "ホチキス・クリップ",
      draw: (
        <>
          <rect x="14" y="10" width="44" height="56" rx="3" fill={PAPER} stroke={LINE} strokeWidth="2" />
          <path d="M20 16 h14 v10 h-14 z" fill="none" stroke={LINE} strokeWidth="2.5" />
        </>
      ),
    },
    {
      label: "大きな折れ・しわ",
      draw: (
        <>
          <path d="M14 10 h44 v56 h-44 z" fill={PAPER} stroke={LINE} strokeWidth="2" />
          <path d="M14 30 L36 44 L58 26" fill="none" stroke={LINE} strokeWidth="2.5" />
          <path d="M14 48 L36 58 L58 44" fill="none" stroke={LINE} strokeWidth="2.5" />
        </>
      ),
    },
    {
      label: "やぶれ",
      draw: (
        <>
          <path d="M14 10 h44 v56 h-30 z" fill={PAPER} stroke={LINE} strokeWidth="2" />
          <path d="M28 66 L44 46 L34 40 L48 24" fill="none" stroke={LINE} strokeWidth="2.5" />
        </>
      ),
    },
    {
      label: "5cmより小さい紙",
      draw: (
        <>
          <rect x="26" y="26" width="22" height="24" rx="2" fill={PAPER} stroke={LINE} strokeWidth="2" />
          <text x="37" y="62" fontSize="10" textAnchor="middle" fill={LINE}>小</text>
        </>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map((it) => (
        <figure key={it.label} className="text-center">
          <svg viewBox="0 0 72 76" role="img" aria-label={it.label} className="w-full h-auto max-w-[5rem] mx-auto">
            {it.draw}
            {/* 禁止の斜線 */}
            <circle cx="36" cy="38" r="30" fill="none" stroke="#dc2626" strokeWidth="3.5" />
            <line x1="16" y1="18" x2="56" y2="58" stroke="#dc2626" strokeWidth="3.5" />
          </svg>
          <figcaption className="text-xs text-gray-700 mt-1.5 leading-tight">{it.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** ⑤ 仕事の全体像。どこまで来たかが分かるように、最初に1枚で見せる */
export function FigureWholeFlow() {
  const steps = ["スキャン", "取り込み", "読み取り確認", "ダブルチェック", "仕訳", "最終確認", "税理士確認", "CSV"];
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-200 text-teal-900 rounded-lg px-2.5 py-1.5 text-sm">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-600 text-white text-xs font-bold">
              {i + 1}
            </span>
            {s}
          </span>
          {i < steps.length - 1 && <span aria-hidden className="text-teal-400">→</span>}
        </li>
      ))}
    </ol>
  );
}
