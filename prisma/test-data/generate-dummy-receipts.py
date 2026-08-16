#!/usr/bin/env python3
"""
テスト用のダミー領収書・請求書を生成する。

実業務で起きるパターンを一通り再現する:
  - 税率10%のみ / 軽減税率8%との混在
  - 登録番号あり（正しい） / 誤読を模した番号 / 番号なし（未登録事業者）
  - かすれ・低コントラスト（感熱紙レシートの再現）
  - 複数ページPDF（束ねてスキャンした場合）
  - 勘定科目が分かれるもの（会議費・旅費交通費・消耗品費・通信費・接待交際費）

すべて実在しない架空の事業者。フッターに「テスト用サンプル」と明記している。

使い方: python3 prisma/test-data/generate-dummy-receipts.py
出力先: prisma/test-data/dummy-receipts/
"""
import os
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT_DIR = Path(__file__).parent / "dummy-receipts"
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
MONO_PATH = "/System/Library/Fonts/Supplemental/Courier New.ttf"

random.seed(20260812)  # 毎回同じものが出るように固定


def font(size, mono=False):
    return ImageFont.truetype(MONO_PATH if mono else FONT_PATH, size)


def broken_tnumber(base12: str) -> str:
    """検査用数字だけ意図的に誤った番号（OCR誤読の検出テスト用）"""
    ok = tnumber(base12)
    wrong = (int(ok[1]) + 1) % 10
    return f"T{wrong}{base12}"


def tnumber(base12: str) -> str:
    """
    架空の登録番号を作る。法人番号の検査用数字を計算して先頭に付ける。

    ※ 実在の事業者と衝突しないよう、基礎番号は 0100010000xx の架空帯を使う。
    """
    assert len(base12) == 12 and base12.isdigit()
    s = sum(int(base12[11 - i]) * (1 if (i + 1) % 2 == 1 else 2) for i in range(12))
    return f"T{9 - (s % 9)}{base12}"


def new_canvas(w, h, bg=(255, 255, 255)):
    img = Image.new("RGB", (w, h), bg)
    return img, ImageDraw.Draw(img)


def text(d, xy, s, size=20, mono=False, fill=(20, 20, 20), anchor=None):
    d.text(xy, s, font=font(size, mono), fill=fill, anchor=anchor)


def line(d, y, x0, x1, fill=(120, 120, 120), width=1):
    d.line([(x0, y), (x1, y)], fill=fill, width=width)


def money(n):
    return f"¥{n:,}"


def footer(d, y, w):
    text(d, (w // 2, y), "※ テスト用サンプル（架空の事業者）", 13,
         fill=(150, 150, 150), anchor="ma")


def receipt_standard(path, *, shop, addr, tel, tnum, date, items, tax_rate=10,
                     payment="現金", title="領　収　書", note=None):
    """一般的な領収書（税率単一）"""
    w, h = 720, 1020
    img, d = new_canvas(w, h)
    text(d, (w // 2, 60), title, 40, anchor="ma")
    text(d, (60, 140), date, 22)
    text(d, (w - 60, 140), "No. " + str(random.randint(100000, 999999)), 18, anchor="ra")
    line(d, 180, 60, w - 60)

    text(d, (60, 210), "　　　　　　　　　　　　　　　様", 24)
    total = sum(q * p for _, q, p in items)
    text(d, (w // 2, 280), money(total), 52, anchor="ma")
    line(d, 350, 120, w - 120, width=2)

    y = 400
    text(d, (60, y), "但", 20)
    text(d, (110, y), (note or (items[0][0] + " ほか")) + "　として", 20)
    y += 60
    text(d, (60, y), "上記正に領収いたしました。", 20)

    y += 80
    line(d, y, 60, w - 60)
    y += 25
    for name, qty, price in items:
        text(d, (80, y), f"{name}", 19)
        text(d, (w - 260, y), f"{qty}", 19, mono=True)
        text(d, (w - 80, y), money(qty * price), 19, mono=True, anchor="ra")
        y += 34
    line(d, y + 6, 60, w - 60)
    y += 30

    tax_included = round(total - total / (1 + tax_rate / 100))
    text(d, (w - 300, y), "小計", 19)
    text(d, (w - 80, y), money(total - tax_included), 19, mono=True, anchor="ra")
    y += 32
    text(d, (w - 300, y), f"消費税（{tax_rate}%）", 19)
    text(d, (w - 80, y), money(tax_included), 19, mono=True, anchor="ra")
    y += 32
    text(d, (w - 300, y), "合計（税込）", 20)
    text(d, (w - 80, y), money(total), 20, mono=True, anchor="ra")
    y += 44
    text(d, (60, y), f"お支払方法： {payment}", 18)

    y = h - 230
    line(d, y, 60, w - 60)
    y += 24
    text(d, (60, y), shop, 24)
    y += 36
    text(d, (60, y), addr, 17, fill=(70, 70, 70))
    y += 28
    text(d, (60, y), f"TEL: {tel}", 17, fill=(70, 70, 70))
    y += 28
    if tnum:
        text(d, (60, y), f"登録番号: {tnum}", 19)
    else:
        text(d, (60, y), "（適格請求書発行事業者ではありません）", 16, fill=(110, 110, 110))
    footer(d, h - 40, w)
    img.save(path, quality=92)
    return path


def receipt_conveni(path):
    """コンビニレシート風（8%と10%の混在・軽減税率）"""
    w, h = 560, 1080
    img, d = new_canvas(w, h, bg=(252, 252, 250))
    text(d, (w // 2, 40), "ローソート芦屋店", 26, anchor="ma")
    text(d, (w // 2, 80), "兵庫県芦屋市翠ケ丘町9-9-9", 15, anchor="ma", fill=(80, 80, 80))
    text(d, (w // 2, 106), "TEL 0797-00-0000", 15, anchor="ma", fill=(80, 80, 80))
    line(d, 140, 40, w - 40)

    # 等幅フォントには日本語の字形がないため、日本語を含む行では使わない
    text(d, (40, 160), "2026年3月5日(木) 12:41", 17)
    text(d, (40, 190), "レシート番号 0000-0031", 15, fill=(90, 90, 90))
    line(d, 220, 40, w - 40)

    rows = [
        ("お茶 500ml", 2, 108, 8),
        ("おにぎり 鮭", 1, 162, 8),
        ("コピー用紙 A4", 1, 528, 10),
        ("ボールペン 黒", 3, 132, 10),
    ]
    y = 250
    for name, qty, price, rate in rows:
        mark = "※" if rate == 8 else "　"
        text(d, (40, y), f"{mark}{name}", 19)
        text(d, (w - 40, y), money(qty * price), 19, mono=True, anchor="ra")
        y += 28
        text(d, (60, y), f"　{qty}コ × {money(price)}", 15, fill=(90, 90, 90))
        y += 32

    line(d, y, 40, w - 40)
    y += 24
    t8 = sum(q * p for _, q, p, r in rows if r == 8)
    t10 = sum(q * p for _, q, p, r in rows if r == 10)
    total = t8 + t10
    text(d, (40, y), "合計", 24)
    text(d, (w - 40, y), money(total), 24, mono=True, anchor="ra")
    y += 42
    text(d, (40, y), f"（内 8%対象  {money(t8)}）", 16)
    y += 26
    text(d, (60, y), f"消費税等 {money(round(t8 - t8 / 1.08))}", 16, fill=(70, 70, 70))
    y += 30
    text(d, (40, y), f"（内10%対象  {money(t10)}）", 16)
    y += 26
    text(d, (60, y), f"消費税等 {money(round(t10 - t10 / 1.10))}", 16, fill=(70, 70, 70))
    y += 40
    text(d, (40, y), "※印は軽減税率対象", 15, fill=(90, 90, 90))
    y += 34
    text(d, (40, y), "現金", 19)
    text(d, (w - 40, y), money(total), 19, mono=True, anchor="ra")

    line(d, h - 130, 40, w - 40)
    text(d, (40, h - 110), f"登録番号: {tnumber('010001000033')}", 18)
    footer(d, h - 50, w)
    img.save(path, quality=92)
    return path


def make_faded(src, dst, blur=1.2, contrast=0.55, noise=14):
    """感熱紙レシートのかすれを再現（OCRの難易度を上げる）"""
    img = Image.open(src).convert("RGB")
    img = img.filter(ImageFilter.GaussianBlur(blur))
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # 白に寄せてコントラストを落とす
            r = int(255 - (255 - r) * contrast)
            g = int(255 - (255 - g) * contrast)
            b = int(255 - (255 - b) * contrast)
            n = random.randint(-noise, noise)
            px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    img.save(dst, quality=88)
    return dst


def to_pdf(images, path):
    """画像を1つのPDFにまとめる（束ねスキャンの再現）"""
    pages = [Image.open(p).convert("RGB") for p in images]
    pages[0].save(path, save_all=True, append_images=pages[1:], resolution=150)
    return path


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    made = []

    # ① 飲食店（接待交際費）・税率10%・登録番号あり（検査用数字が正しい）
    made.append(receipt_standard(
        OUT_DIR / "01-restaurant-10pct.jpg",
        shop="居酒屋 まんぷく亭", addr="兵庫県西宮市架空町1-2-3 テストビル2F",
        tel="0798-00-0001", tnum=tnumber("010001000011"), date="2026年4月3日",
        items=[("お食事コース", 3, 4500), ("ドリンク", 6, 550)],
        note="ご飲食代", payment="クレジットカード"))

    # ② タクシー（旅費交通費）・少額
    made.append(receipt_standard(
        OUT_DIR / "02-taxi-transport.jpg",
        shop="架空交通株式会社", addr="兵庫県神戸市架空区5-6-7",
        tel="078-000-0002", tnum=tnumber("010001000022"), date="2026年4月10日",
        items=[("運賃（芦屋→三宮）", 1, 3280)],
        note="タクシー代", payment="現金"))

    # ③ 事務用品（消耗品費）・登録番号なし（未登録の個人商店を想定）
    made.append(receipt_standard(
        OUT_DIR / "03-supplies-no-tnumber.jpg",
        shop="まちの文具店", addr="兵庫県芦屋市架空1-1",
        tel="0797-00-0003", tnum=None, date="2026年4月15日",
        items=[("コピー用紙 A4 500枚", 5, 480), ("ファイル", 10, 128)],
        note="事務用品代", payment="現金"))

    # ④ 通信費・登録番号の検査用数字が誤っている（読み取り誤りの検出テスト用）
    made.append(receipt_standard(
        OUT_DIR / "04-telecom-invalid-tnumber.jpg",
        shop="架空ネットワーク株式会社", addr="大阪府大阪市架空区8-9",
        tel="06-0000-0004", tnum=broken_tnumber("010001000044"), date="2026年4月20日",
        items=[("インターネット回線 4月分", 1, 6600)],
        note="通信料", payment="口座振替", title="領収証"))

    # ⑤ コンビニ（軽減税率8%と10%の混在）
    made.append(receipt_conveni(OUT_DIR / "05-conveni-mixed-tax.jpg"))

    # ⑥ かすれレシート（OCRの難易度が高いもの）
    made.append(make_faded(OUT_DIR / "01-restaurant-10pct.jpg",
                           OUT_DIR / "06-faded-hard.jpg"))

    # ⑦ 複数ページPDF（3枚を束ねてスキャンした場合）
    made.append(to_pdf([OUT_DIR / "01-restaurant-10pct.jpg",
                        OUT_DIR / "02-taxi-transport.jpg",
                        OUT_DIR / "03-supplies-no-tnumber.jpg"],
                       OUT_DIR / "07-multipage-3receipts.pdf"))

    # ⑧ 単票PDF（電子請求書を想定）
    made.append(to_pdf([OUT_DIR / "04-telecom-invalid-tnumber.jpg"],
                       OUT_DIR / "08-single-invoice.pdf"))

    print(f"生成先: {OUT_DIR}")
    for p in made:
        print(f"  {Path(p).name:38} {os.path.getsize(p)//1024:>5} KB")


if __name__ == "__main__":
    main()
