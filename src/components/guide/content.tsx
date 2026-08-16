import {
  ScanLine, Upload, FileSearch, UserCheck, Sparkles,
  ClipboardCheck, FileSpreadsheet,
} from "lucide-react";
import {
  FigureOpenCover, FigurePaperDirection, FigureReceiptGuide, FigureBadPaper,
} from "@/components/guide/ScannerFigures";
import type { GuideTrouble } from "@/components/guide/GuideParts";

/**
 * 説明書の中身。**文章はここにしか無い。**
 *
 * 説明書のページ（`/guide`）と、作業画面の横に出すパネル（`GuidePanel`）の
 * 両方がこれを読む。片方だけ直して、もう片方が古いまま、が起きないようにする。
 *
 * ## 書き方の約束
 *
 * - **1つの見出しに1つの作業。** 「〜して、〜する」と2つ書かない
 * - **画面に出ている言葉をそのまま使う。** 説明書だけの言い換えを作らない
 *   （「アップロード」を「取り込み」と呼び替えると、画面を探せなくなる）
 * - **困りごとはその場に書く。** 巻末にまとめると、そこまでたどり着けない
 * - 漢字を開く（「下さい」→「ください」）。むずかしい言い方を避ける
 *
 * 値を `React.ReactNode` のまま持つのは、文中の強調を保つため。
 * 文字列＋独自の記法にすると、書くたびに変換の決まりを思い出すことになる。
 */

export interface GuideChapter {
  /** 章の番号。見出しにも `#step-N` のリンク先にも使う */
  step: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** 章の頭に置く一言。パネルではここが最初に目に入る */
  lead?: React.ReactNode;
  /** 図。パネルでは場所を取るので出さないこともある */
  figure?: React.ReactNode;
  /** 図（大きいもの）。説明書のページだけに出す */
  wideFigure?: React.ReactNode;
  steps?: React.ReactNode[];
  notes?: React.ReactNode[];
  tips?: React.ReactNode[];
  troubles?: GuideTrouble[];
  toConfirm?: React.ReactNode;
}

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    step: 1,
    title: "レシートをそろえる",
    icon: ClipboardCheck,
    lead: (
      <>
        スキャナーに入れる前に、紙の状態を整えます。
        <strong className="text-foreground">ここを飛ばすと、あとの作業がまるごとやり直しになります。</strong>
      </>
    ),
    steps: [
      <>ホチキスの針・クリップを<strong>すべて外す</strong>（機械の中が傷つきます）</>,
      <>折れやしわを、手で伸ばす</>,
      <>レシートの向きを<strong>ぜんぶ同じ</strong>にそろえる（上下・裏表）</>,
      <>破れているものは、ほかと分けておく</>,
    ],
    wideFigure: (
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-2">スキャナーに入れられない紙</h3>
        <FigureBadPaper />
      </div>
    ),
    notes: [
      <>
        <strong>5cm×5cmより小さい紙</strong>は、そのままでは入りません。
        小さなレシートは、白い紙に貼るか、あとで写真を撮って入れてください。
      </>,
    ],
    troubles: [
      {
        q: "レシートがくるくる丸まっている",
        a: "本などの下に10分ほど挟んでおくと伸びます。丸まったまま入れると、途中で詰まります。",
      },
      {
        q: "文字が薄くて読めない",
        a: "そのまま入れて大丈夫です。読み取ったあと、画面で自分の目で確かめて直せます。ただし、まったく読めないものは、あとで困るので分けておいてください。",
      },
    ],
  },

  {
    step: 2,
    title: "スキャナーで読み取る",
    icon: ScanLine,
    lead: (
      <>
        使うのは <strong>ScanSnap iX2500</strong> です。前面に四角い画面（タッチパネル）が付いています。
      </>
    ),
    figure: (
      <div className="grid sm:grid-cols-2 gap-5">
        <FigureOpenCover />
        <FigurePaperDirection />
      </div>
    ),
    steps: [
      <>スキャナーの<strong>上のカバーを手前に開ける</strong>。これで電源が入ります（3秒ほどで使えます）</>,
      <>レシートを<strong>読みたい面を下に向けて</strong>入れる。手前から見て「うら」が見えていれば合っています</>,
      <><strong>文字の上がわ</strong>（お店の名前がある側）が下になるように入れる</>,
      <>両側のガイドを、紙の幅に合わせて寄せる（すき間があると斜めに入ります）</>,
      <>タッチパネルで、いつも使う設定を選ぶ</>,
      <>タッチパネルの<strong>外にある「Scan」ボタン</strong>を押す</>,
      <>読み取りが終わったら、PDFがパソコンに保存されます</>,
    ],
    toConfirm: (
      <>
        タッチパネルで選ぶ設定の名前と、PDFが保存される場所を、事業所で決めて書き足してください。
        <br />
        例：「<span className="bg-white px-1.5 py-0.5 rounded border">レシート</span>
        というアイコンを押す → デスクトップの
        <span className="bg-white px-1.5 py-0.5 rounded border">スキャン</span>
        フォルダに入る」
      </>
    ),
    wideFigure: (
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-2">幅の違うレシートをまとめて入れたいとき</h3>
        <div className="max-w-sm">
          <FigureReceiptGuide />
        </div>
      </div>
    ),
    tips: [
      <>
        <strong>1枚のレシートにつき1つの仕訳</strong>になるのが、いちばんきれいです。
        何枚も続けてスキャンしても、あとで自動的に1枚ずつに分かれるので心配いりません。
      </>,
    ],
    notes: [
      <>
        レシートは<strong>感熱紙</strong>（熱で色が変わる紙）です。
        長く置くと文字が消えていくので、<strong>もらったら早めにスキャン</strong>してください。
      </>,
    ],
    troubles: [
      {
        q: "紙が斜めに読み取られた",
        a: "両側のガイドが紙に当たっていないと斜めになります。ガイドを紙の幅ぴったりに寄せて、もう一度スキャンしてください。",
      },
      {
        q: "2枚いっしょに入ってしまった",
        a: "スキャナーが止まって知らせます。その2枚を取り出し、よくさばいてから入れ直してください。",
      },
      {
        q: "紙が詰まった",
        a: "無理に引っ張らないでください。カバーを開けて、まっすぐゆっくり抜きます。指導員に声をかけてもかまいません。",
      },
    ],
  },

  {
    step: 3,
    title: "PDFをこの画面に入れる",
    icon: Upload,
    steps: [
      <>この画面の上にある<strong>「作業開始」</strong>を押す</>,
      <>ダッシュボードの<strong>Step 3</strong>（できたPDFをこの画面に入れる）を押す</>,
      <>出てきた四角の中に、<strong>PDFをドラッグして入れる</strong>。または「ファイルを選ぶ」から選ぶ</>,
      <>入れたファイルがフォルダになって、一覧に出ます</>,
    ],
    tips: [<>何個でもいっぺんに入れられます。1回の作業でまとめて入れると、あとが楽です。</>],
    troubles: [
      {
        q: "ファイルを入れたのに出てこない",
        a: "画面を一度読み込み直してください（F5 キー）。それでも出ないときは、指導員に伝えてください。",
      },
      {
        q: "まちがったファイルを入れた",
        a: "フォルダの右にあるゴミ箱のマークで消せます。消すと元に戻せないので、名前をよく見てから押してください。",
      },
    ],
  },

  {
    step: 4,
    title: "読み取った文字を確かめる",
    icon: FileSearch,
    lead: (
      <>
        コンピューターがレシートを読みます。
        <strong className="text-foreground">読み間違いがないか、自分の目で確かめるのがこの作業です。</strong>
        ここが、この仕事でいちばん大事なところです。
      </>
    ),
    steps: [
      <>フォルダを開く（黄色い吹き出しが次に押すところを教えてくれます）</>,
      <><strong>左に出ているレシートの画像</strong>と、右の入力欄を見比べる</>,
      <>日付・金額・消費税・登録番号（Tではじまる番号）が合っているか見る</>,
      <>ちがっていたら、その場で直す</>,
      <>合っていたら<strong>「確認完了」</strong>を押して、次のレシートへ</>,
    ],
    notes: [
      <>
        <strong>金額はとくに気をつけて見てください。</strong>
        「3」と「8」、「0」と「6」は読み間違えやすい数字です。
      </>,
    ],
    tips: [
      <>
        登録番号（T + 数字13桁）が<strong>元から書かれていない</strong>レシートもあります。
        そのときは「登録番号はありません」にチェックを入れれば、先に進めます。
        探しても無いものを探し続けなくて大丈夫です。
      </>,
    ],
    troubles: [
      {
        q: "画像が小さくて読めない",
        a: "「元のファイルを開く（拡大して見る）」を押すと、大きく表示できます。",
      },
      {
        q: "何ページもあるPDFを入れてしまった",
        a: "自動的に1枚ずつに分かれています。ページごとに確認してください。",
      },
    ],
  },

  {
    step: 5,
    title: "ダブルチェックをする",
    icon: UserCheck,
    lead: (
      <>
        <strong className="text-foreground">同じ人が2回見ても、同じ見落とし方をします。</strong>
        そのため、読み取りを確かめた人とは<strong>別の人</strong>がもう一度見ます。
      </>
    ),
    steps: [
      <>ダッシュボードの「ダブルチェック待ち」から、フォルダを開く</>,
      <>前の人が入力した数字を、レシートと見比べる</>,
      <>ちがっていたら直す。合っていたらチェックを付ける</>,
      <>全部終わったら<strong>「ダブルチェック完了」</strong>を押す</>,
    ],
    notes: [
      <>
        自分が読み取りを確かめたフォルダは、自分ではダブルチェックできません。
        これはわざとそうしてあります。
      </>,
    ],
  },

  {
    step: 6,
    title: "仕訳をつける",
    icon: Sparkles,
    lead: (
      <>
        「このレシートは何に使ったお金か」を決めます。
        コンピューターが先に案を出すので、
        <strong className="text-foreground">それで合っているかを見て、必要なら直します。</strong>
      </>
    ),
    steps: [
      <>フォルダの画面で<strong>「仕訳する」</strong>を押す</>,
      <>コンピューターが勘定科目（かんじょうかもく）の案を出す</>,
      <>レシートの中身と見比べて、合っていなければ選び直す</>,
      <>お店の名前が入っているか見る</>,
      <>できたら<strong>「確認完了」</strong>を押す</>,
    ],
    tips: [
      <>
        コンビニのレシートなど、<strong>8%と10%が混ざっている</strong>ものは、
        自動的に2つの仕訳に分かれます。「1枚を税率で2件に分けています」と出ていれば、それで合っています。
        <strong>同じものが2回記録されているわけではありません。</strong>
      </>,
    ],
    toConfirm: (
      <>
        よく使う勘定科目と、その選び方を、事業所で決めて書き足してください。
        <br />
        例：「お茶やお菓子 → 会議費」「電車・バス → 旅費交通費」「ボールペン・コピー用紙 → 消耗品費」
      </>
    ),
    troubles: [
      {
        q: "どの勘定科目か分からない",
        a: "無理に決めないでください。分からないまま進めると、あとで直すのが大変になります。指導員に聞いてください。",
      },
      {
        q: "同じレシートが2つあるように見える",
        a: "本当に同じものが2枚あるときは、画面が「重複かもしれません」と教えてくれます。1枚を税率で分けた場合は、レシートの絵が同じ枠でつながっています。",
      },
    ],
  },

  {
    step: 7,
    title: "最終確認と、税理士さんへのお願い",
    icon: ClipboardCheck,
    steps: [
      <>フォルダの画面で<strong>「最終確認」</strong>を開く</>,
      <>金額の合計や、抜けているところがないか見る</>,
      <><strong>「税理士に確認を依頼」</strong>を押す</>,
    ],
    lead: (
      <>
        このあと税理士さんが見ます。直したほうがよいところがあると、
        <strong className="text-foreground">ダッシュボードに「税理士から差し戻し」と出ます。</strong>
        そのときは、書かれている理由を読んで直し、もう一度お願いしてください。
      </>
    ),
    tips: [
      <>
        税理士さんがその場で直してくれることもあります。そのときは
        <strong>「税理士が○件直しました」</strong>と出ます。
        何をどう直したかは、仕訳の「詳細」で見られます。
        <strong>次から同じところを間違えないように、ぜひ見てください。</strong>
      </>,
    ],
  },

  {
    step: 8,
    title: "CSVを書き出す",
    icon: FileSpreadsheet,
    lead: <>最後に、会計ソフトに入れるためのファイルを作ります。</>,
    steps: [
      <>フォルダの画面で<strong>「CSVエクスポート」</strong>を押す</>,
      <>税理士さんが使っている会計ソフトを選ぶ</>,
      <>ファイルがパソコンに保存されます</>,
    ],
    wideFigure: (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-gray-600 border-b border-gray-200">
              <th className="py-2 pr-3 font-medium">選ぶもの</th>
              <th className="py-2 font-medium">できるファイル</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr><td className="py-2 pr-3 font-medium text-foreground">マネーフォワード</td><td className="py-2 text-gray-700">〜_mf.csv</td></tr>
            <tr><td className="py-2 pr-3 font-medium text-foreground">freee</td><td className="py-2 text-gray-700">〜_freee.csv</td></tr>
            <tr><td className="py-2 pr-3 font-medium text-foreground">弥生会計</td><td className="py-2 text-gray-700">〜_yayoi.txt（.csv ではありません）</td></tr>
          </tbody>
        </table>
      </div>
    ),
    notes: [
      <>
        <strong>弥生会計だけ、できるファイルが .txt です。</strong>
        まちがいではありません。弥生会計はこの形で受け取ります。
      </>,
    ],
    toConfirm: (
      <>
        できたファイルを税理士さんに渡す方法を、事業所で決めて書き足してください。
        <br />
        例：「メールに添付して送る」「共有フォルダの〇〇に入れる」
      </>
    ),
  },
];

/** 番号で1章を引く */
export function chapterByStep(step: number): GuideChapter | undefined {
  return GUIDE_CHAPTERS.find((c) => c.step === step);
}
