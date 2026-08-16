import Link from "next/link";
import {
  ScanLine, Upload, FileSearch, UserCheck, Sparkles, ClipboardCheck,
  FileSpreadsheet, Printer, AlertTriangle, Lightbulb, ArrowLeft, HelpCircle,
} from "lucide-react";
import {
  FigureOpenCover, FigurePaperDirection, FigureReceiptGuide,
  FigureBadPaper, FigureWholeFlow,
} from "@/components/guide/ScannerFigures";

export const metadata = { title: "はじめての方へ | 記帳代行ツール" };

/**
 * 利用者さん向けの説明書。
 *
 * **人に教わらなくても、これを読めば最後まで進める**ことを目標にしている。
 * 就労支援の現場で、初めての方が最初に開くページ。
 *
 * ## 書き方の約束
 *
 * - **1つの見出しに1つの作業。** 「〜して、〜する」と2つ書かない
 * - **画面に出ている言葉をそのまま使う。** 説明書だけの言い換えを作らない
 *   （「アップロード」を「取り込み」と呼び替えると、画面を探せなくなる）
 * - **困りごとはその場に書く。** 巻末にまとめると、そこまでたどり着けない
 * - 漢字を開く（「下さい」→「ください」）。ふりがなは付けないが、
 *   むずかしい言い方は避ける
 *
 * ## 絵について
 *
 * いまは線画（`ScannerFigures.tsx`）。**実機の写真が届いたら差し替える。**
 * 写真のほうが伝わるので、差し替えを前提にした作りにしてある。
 *
 * ## 印刷
 *
 * 紙で配れるように、印刷用の指定を `globals.css` に置いている
 * （ヘッダー・ナビ・ボタンを消し、白地にする）。
 */

/** 章のまとまり。番号と見出しと本文をひとまとめにする */
function Section({
  step, title, icon: Icon, children,
}: {
  step: number;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section id={`step-${step}`} className="card-glass rounded-xl p-5 md:p-6 scroll-mt-24">
      <div className="flex items-start gap-3 mb-4">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-teal-600 text-white text-lg font-black shrink-0">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="text-xl md:text-2xl font-black text-foreground flex items-center gap-2">
            <Icon className="w-5 h-5 text-teal-600 shrink-0" />
            {title}
          </h2>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** やること。番号付きで、1行1動作 */
function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-100 text-teal-800 text-sm font-bold shrink-0 mt-0.5">
            {i + 1}
          </span>
          <span className="text-foreground leading-relaxed">{t}</span>
        </li>
      ))}
    </ol>
  );
}

/** 気をつけること。赤ではなく琥珀にする（できないことではなく、注意なので） */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3">
      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="text-sm text-amber-900 leading-relaxed">{children}</div>
    </div>
  );
}

/** 知っていると楽になること */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 bg-teal-50 border border-teal-200 rounded-lg p-3">
      <Lightbulb className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
      <div className="text-sm text-teal-900 leading-relaxed">{children}</div>
    </div>
  );
}

/** こまったとき。Q&A を作業のすぐ横に置く */
function Trouble({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <div className="border-t border-gray-200 pt-4 space-y-3">
      <h3 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
        <HelpCircle className="w-4 h-4 text-gray-400" />
        こまったとき
      </h3>
      {items.map((it) => (
        <div key={it.q}>
          <p className="text-sm font-bold text-foreground">{it.q}</p>
          <p className="text-sm text-gray-700 leading-relaxed mt-0.5">{it.a}</p>
        </div>
      ))}
    </div>
  );
}

/** 実機の設定に合わせて直す場所。**印刷しても分かるように残す** */
function ToConfirm({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-2 border-dashed border-gray-300 bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
      <span className="font-bold text-gray-800">【事業所で確かめて書き足すところ】</span>
      <div className="mt-1 leading-relaxed">{children}</div>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="print:hidden">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-teal-700 hover:text-teal-900">
          <ArrowLeft className="w-4 h-4" />
          ダッシュボードに戻る
        </Link>
      </div>

      <header className="card-glass rounded-xl p-5 md:p-6">
        <h1 className="text-2xl md:text-3xl font-black text-foreground mb-2">
          はじめての方へ
        </h1>
        <p className="text-gray-700 leading-relaxed">
          紙のレシートを、会計ソフトに入れられるデータにするまでの流れです。
          上から順にやれば終わります。<strong className="text-foreground">分からなくなったら、いつでもここに戻ってきてください。</strong>
        </p>

        <div className="mt-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">ぜんぶで8つです</h2>
          <FigureWholeFlow />
        </div>

        <p className="text-sm text-gray-600 mt-4">
          1〜2はスキャナーの作業、3〜8はこの画面の作業です。
          はじめは1日で全部やらなくてかまいません。途中でやめても、続きから再開できます。
        </p>

        {/*
          印刷はブラウザの標準機能に任せる。ボタンを置くとクライアント部品が要るが、
          このページは中身が動かないので、サーバー側で組み立てたままにしたい。
        */}
        {/* inline-flex は折り返さないので、狭い画面でここだけ横にはみ出していた */}
        <p className="mt-4 flex flex-wrap items-center gap-1.5 text-sm text-gray-600 print:hidden">
          <Printer className="w-4 h-4 text-gray-400" />
          紙で持っておきたいときは <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">⌘</kbd>
          <span>＋</span>
          <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">P</kbd>
          （Windows は <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">Ctrl</kbd>＋
          <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">P</kbd>）で印刷できます
        </p>
      </header>

      {/* ===== 1 ===== */}
      <Section step={1} title="レシートをそろえる" icon={ClipboardCheck}>
        <p className="text-foreground leading-relaxed">
          スキャナーに入れる前に、紙の状態を整えます。
          <strong className="text-foreground">ここを飛ばすと、あとの作業がまるごとやり直しになります。</strong>
        </p>

        <Steps
          items={[
            <>ホチキスの針・クリップを<strong>すべて外す</strong>（機械の中が傷つきます）</>,
            <>折れやしわを、手で伸ばす</>,
            <>レシートの向きを<strong>ぜんぶ同じ</strong>にそろえる（上下・裏表）</>,
            <>破れているものは、ほかと分けておく</>,
          ]}
        />

        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2">スキャナーに入れられない紙</h3>
          <FigureBadPaper />
        </div>

        <Note>
          <strong>5cm×5cmより小さい紙</strong>は、そのままでは入りません。
          小さなレシートは、白い紙に貼るか、あとで写真を撮って入れてください。
        </Note>

        <Trouble
          items={[
            {
              q: "レシートがくるくる丸まっている",
              a: "本などの下に10分ほど挟んでおくと伸びます。丸まったまま入れると、途中で詰まります。",
            },
            {
              q: "文字が薄くて読めない",
              a: "そのまま入れて大丈夫です。読み取ったあと、画面で自分の目で確かめて直せます。ただし、まったく読めないものは、あとで困るので分けておいてください。",
            },
          ]}
        />
      </Section>

      {/* ===== 2 ===== */}
      <Section step={2} title="スキャナーで読み取る" icon={ScanLine}>
        <p className="text-foreground leading-relaxed">
          使うのは <strong>ScanSnap iX2500</strong> です。前面に四角い画面（タッチパネル）が付いています。
        </p>

        <div className="grid sm:grid-cols-2 gap-5">
          <FigureOpenCover />
          <FigurePaperDirection />
        </div>

        <Steps
          items={[
            <>スキャナーの<strong>上のカバーを手前に開ける</strong>。これで電源が入ります（3秒ほどで使えます）</>,
            <>レシートを<strong>読みたい面を下に向けて</strong>入れる。手前から見て「うら」が見えていれば合っています</>,
            <><strong>文字の上がわ</strong>（お店の名前がある側）が下になるように入れる</>,
            <>両側のガイドを、紙の幅に合わせて寄せる（すき間があると斜めに入ります）</>,
            <>タッチパネルで、いつも使う設定を選ぶ</>,
            <>タッチパネルの<strong>外にある「Scan」ボタン</strong>を押す</>,
            <>読み取りが終わったら、PDFがパソコンに保存されます</>,
          ]}
        />

        <ToConfirm>
          タッチパネルで選ぶ設定の名前と、PDFが保存される場所を、事業所で決めて書き足してください。
          <br />
          例：「<span className="bg-white px-1.5 py-0.5 rounded border">レシート</span>
          というアイコンを押す → デスクトップの
          <span className="bg-white px-1.5 py-0.5 rounded border">スキャン</span>
          フォルダに入る」
        </ToConfirm>

        <div>
          <h3 className="text-sm font-bold text-gray-700 mb-2">
            幅の違うレシートをまとめて入れたいとき
          </h3>
          <div className="max-w-sm">
            <FigureReceiptGuide />
          </div>
        </div>

        <Tip>
          <strong>1枚のレシートにつき1つの仕訳</strong>になるのが、いちばんきれいです。
          何枚も続けてスキャンしても、あとで自動的に1枚ずつに分かれるので心配いりません。
        </Tip>

        <Note>
          レシートは<strong>感熱紙</strong>（熱で色が変わる紙）です。
          長く置くと文字が消えていくので、<strong>もらったら早めにスキャン</strong>してください。
        </Note>

        <Trouble
          items={[
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
          ]}
        />
      </Section>

      {/* ===== 3 ===== */}
      <Section step={3} title="PDFをこの画面に入れる" icon={Upload}>
        <Steps
          items={[
            <>この画面の上にある<strong>「作業開始」</strong>を押す</>,
            <>ダッシュボードの<strong>Step 3</strong>（できたPDFをこの画面に入れる）を押す</>,
            <>出てきた四角の中に、<strong>PDFをドラッグして入れる</strong>。または「ファイルを選ぶ」から選ぶ</>,
            <>入れたファイルがフォルダになって、一覧に出ます</>,
          ]}
        />

        <Tip>
          何個でもいっぺんに入れられます。1回の作業でまとめて入れると、あとが楽です。
        </Tip>

        <Trouble
          items={[
            {
              q: "ファイルを入れたのに出てこない",
              a: "画面を一度読み込み直してください（F5 キー）。それでも出ないときは、指導員に伝えてください。",
            },
            {
              q: "まちがったファイルを入れた",
              a: "フォルダの右にあるゴミ箱のマークで消せます。消すと元に戻せないので、名前をよく見てから押してください。",
            },
          ]}
        />
      </Section>

      {/* ===== 4 ===== */}
      <Section step={4} title="読み取った文字を確かめる" icon={FileSearch}>
        <p className="text-foreground leading-relaxed">
          コンピューターがレシートを読みます。
          <strong className="text-foreground">読み間違いがないか、自分の目で確かめるのがこの作業です。</strong>
          ここが、この仕事でいちばん大事なところです。
        </p>

        <Steps
          items={[
            <>フォルダを開く（黄色い吹き出しが次に押すところを教えてくれます）</>,
            <><strong>左に出ているレシートの画像</strong>と、右の入力欄を見比べる</>,
            <>日付・金額・消費税・登録番号（Tではじまる番号）が合っているか見る</>,
            <>ちがっていたら、その場で直す</>,
            <>合っていたら<strong>「確認完了」</strong>を押して、次のレシートへ</>,
          ]}
        />

        <Note>
          <strong>金額はとくに気をつけて見てください。</strong>
          「3」と「8」、「0」と「6」は読み間違えやすい数字です。
        </Note>

        <Tip>
          登録番号（T + 数字13桁）が<strong>元から書かれていない</strong>レシートもあります。
          そのときは「登録番号はありません」にチェックを入れれば、先に進めます。
          探しても無いものを探し続けなくて大丈夫です。
        </Tip>

        <Trouble
          items={[
            {
              q: "画像が小さくて読めない",
              a: "「元のファイルを開く（拡大して見る）」を押すと、大きく表示できます。",
            },
            {
              q: "何ページもあるPDFを入れてしまった",
              a: "自動的に1枚ずつに分かれています。ページごとに確認してください。",
            },
          ]}
        />
      </Section>

      {/* ===== 5 ===== */}
      <Section step={5} title="ダブルチェックをする" icon={UserCheck}>
        <p className="text-foreground leading-relaxed">
          <strong className="text-foreground">同じ人が2回見ても、同じ見落とし方をします。</strong>
          そのため、読み取りを確かめた人とは<strong>別の人</strong>がもう一度見ます。
        </p>

        <Steps
          items={[
            <>ダッシュボードの「ダブルチェック待ち」から、フォルダを開く</>,
            <>前の人が入力した数字を、レシートと見比べる</>,
            <>ちがっていたら直す。合っていたらチェックを付ける</>,
            <>全部終わったら<strong>「ダブルチェック完了」</strong>を押す</>,
          ]}
        />

        <Note>
          自分が読み取りを確かめたフォルダは、自分ではダブルチェックできません。
          これはわざとそうしてあります。
        </Note>
      </Section>

      {/* ===== 6 ===== */}
      <Section step={6} title="仕訳をつける" icon={Sparkles}>
        <p className="text-foreground leading-relaxed">
          「このレシートは何に使ったお金か」を決めます。
          コンピューターが先に案を出すので、<strong className="text-foreground">それで合っているかを見て、必要なら直します。</strong>
        </p>

        <Steps
          items={[
            <>フォルダの画面で<strong>「仕訳する」</strong>を押す</>,
            <>コンピューターが勘定科目（かんじょうかもく）の案を出す</>,
            <>レシートの中身と見比べて、合っていなければ選び直す</>,
            <>お店の名前が入っているか見る</>,
            <>できたら<strong>「確認完了」</strong>を押す</>,
          ]}
        />

        <Tip>
          コンビニのレシートなど、<strong>8%と10%が混ざっている</strong>ものは、
          自動的に2つの仕訳に分かれます。「1枚を税率で2件に分けています」と出ていれば、それで合っています。
          <strong>同じものが2回記録されているわけではありません。</strong>
        </Tip>

        <ToConfirm>
          よく使う勘定科目と、その選び方を、事業所で決めて書き足してください。
          <br />
          例：「お茶やお菓子 → 会議費」「電車・バス → 旅費交通費」「ボールペン・コピー用紙 → 消耗品費」
        </ToConfirm>

        <Trouble
          items={[
            {
              q: "どの勘定科目か分からない",
              a: "無理に決めないでください。分からないまま進めると、あとで直すのが大変になります。指導員に聞いてください。",
            },
            {
              q: "同じレシートが2つあるように見える",
              a: "本当に同じものが2枚あるときは、画面が「重複かもしれません」と教えてくれます。1枚を税率で分けた場合は、レシートの絵が同じ枠でつながっています。",
            },
          ]}
        />
      </Section>

      {/* ===== 7 ===== */}
      <Section step={7} title="最終確認と、税理士さんへのお願い" icon={ClipboardCheck}>
        <Steps
          items={[
            <>フォルダの画面で<strong>「最終確認」</strong>を開く</>,
            <>金額の合計や、抜けているところがないか見る</>,
            <><strong>「税理士に確認を依頼」</strong>を押す</>,
          ]}
        />

        <p className="text-foreground leading-relaxed">
          このあと税理士さんが見ます。直したほうがよいところがあると、
          <strong className="text-foreground">ダッシュボードに「税理士から差し戻し」と出ます。</strong>
          そのときは、書かれている理由を読んで直し、もう一度お願いしてください。
        </p>

        <Tip>
          税理士さんがその場で直してくれることもあります。そのときは
          <strong>「税理士が○件直しました」</strong>と出ます。
          何をどう直したかは、仕訳の「詳細」で見られます。
          <strong>次から同じところを間違えないように、ぜひ見てください。</strong>
        </Tip>
      </Section>

      {/* ===== 8 ===== */}
      <Section step={8} title="CSVを書き出す" icon={FileSpreadsheet}>
        <p className="text-foreground leading-relaxed">
          最後に、会計ソフトに入れるためのファイルを作ります。
        </p>

        <Steps
          items={[
            <>フォルダの画面で<strong>「CSVエクスポート」</strong>を押す</>,
            <>税理士さんが使っている会計ソフトを選ぶ</>,
            <>ファイルがパソコンに保存されます</>,
          ]}
        />

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

        <Note>
          <strong>弥生会計だけ、できるファイルが .txt です。</strong>
          まちがいではありません。弥生会計はこの形で受け取ります。
        </Note>

        <ToConfirm>
          できたファイルを税理士さんに渡す方法を、事業所で決めて書き足してください。
          <br />
          例：「メールに添付して送る」「共有フォルダの〇〇に入れる」
        </ToConfirm>
      </Section>

      {/* 末尾 */}
      <section className="card-glass rounded-xl p-5 md:p-6">
        <h2 className="text-xl font-black text-foreground mb-3">最後に</h2>
        <p className="text-foreground leading-relaxed">
          分からないことがあったら、<strong className="text-foreground">とりあえず進めるより、聞いてください。</strong>
          お金の記録なので、あとから直すほうがずっと大変です。
          聞くことは、この仕事ではきちんとした仕事のやり方です。
        </p>
        <ToConfirm>
          聞く相手（指導員の名前）と、連絡の方法を書き足してください。
        </ToConfirm>
        <div className="mt-4 print:hidden">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold"
          >
            はじめる
          </Link>
        </div>
      </section>
    </div>
  );
}
