import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SEED_ACCOUNTS = [
  // 資産
  { code: "1111", name: "現金", category: "資産" },
  { code: "1121", name: "普通預金", category: "資産" },
  { code: "1122", name: "当座預金", category: "資産" },
  { code: "1131", name: "売掛金", category: "資産" },
  { code: "1141", name: "受取手形", category: "資産" },
  { code: "1151", name: "商品", category: "資産" },
  { code: "1161", name: "前払金", category: "資産" },
  { code: "1171", name: "前払費用", category: "資産" },
  { code: "1181", name: "立替金", category: "資産" },
  { code: "1191", name: "仮払金", category: "資産" },
  { code: "1201", name: "未収入金", category: "資産" },
  { code: "1501", name: "建物", category: "資産" },
  { code: "1511", name: "車両運搬具", category: "資産" },
  { code: "1521", name: "工具器具備品", category: "資産" },
  { code: "1531", name: "土地", category: "資産" },
  // 負債
  { code: "2111", name: "買掛金", category: "負債" },
  { code: "2121", name: "未払金", category: "負債" },
  { code: "2131", name: "未払費用", category: "負債" },
  { code: "2141", name: "前受金", category: "負債" },
  { code: "2151", name: "預り金", category: "負債" },
  { code: "2161", name: "仮受金", category: "負債" },
  { code: "2171", name: "未払法人税等", category: "負債" },
  { code: "2181", name: "未払消費税等", category: "負債" },
  { code: "2501", name: "長期借入金", category: "負債" },
  // 純資産
  { code: "3111", name: "資本金", category: "純資産" },
  { code: "3211", name: "繰越利益剰余金", category: "純資産" },
  // 収益
  { code: "4111", name: "売上高", category: "収益" },
  { code: "4211", name: "受取利息", category: "収益" },
  { code: "4221", name: "受取配当金", category: "収益" },
  { code: "4231", name: "雑収入", category: "収益" },
  // 費用
  { code: "5111", name: "仕入高", category: "費用" },
  { code: "7111", name: "給料手当", category: "費用" },
  { code: "7112", name: "賞与", category: "費用" },
  { code: "7113", name: "法定福利費", category: "費用" },
  { code: "7114", name: "福利厚生費", category: "費用" },
  { code: "7121", name: "旅費交通費", category: "費用" },
  { code: "7131", name: "接待交際費", category: "費用" },
  { code: "7141", name: "通信費", category: "費用" },
  { code: "7151", name: "消耗品費", category: "費用" },
  { code: "7161", name: "水道光熱費", category: "費用" },
  { code: "7171", name: "地代家賃", category: "費用" },
  { code: "7181", name: "保険料", category: "費用" },
  { code: "7191", name: "修繕費", category: "費用" },
  { code: "7201", name: "広告宣伝費", category: "費用" },
  { code: "7211", name: "外注費", category: "費用" },
  { code: "7221", name: "会議費", category: "費用" },
  { code: "7231", name: "新聞図書費", category: "費用" },
  { code: "7241", name: "車両費", category: "費用" },
  { code: "7251", name: "支払手数料", category: "費用" },
  { code: "7261", name: "租税公課", category: "費用" },
  { code: "7271", name: "減価償却費", category: "費用" },
  { code: "7281", name: "リース料", category: "費用" },
  { code: "7291", name: "諸会費", category: "費用" },
  { code: "7299", name: "雑費", category: "費用" },
  { code: "7301", name: "支払利息", category: "費用" },
];

export async function POST() {
  try {
    let created = 0;
    let skipped = 0;

    for (const account of SEED_ACCOUNTS) {
      const existing = await prisma.account.findUnique({
        where: { code: account.code },
      });

      if (!existing) {
        await prisma.account.create({ data: account });
        created++;
      } else {
        skipped++;
      }
    }

    return NextResponse.json({
      message: `勘定科目マスターを登録しました (新規: ${created}, スキップ: ${skipped})`,
      created,
      skipped,
    });
  } catch (error) {
    console.error("Error seeding accounts:", error);
    return NextResponse.json({ error: "勘定科目の登録に失敗しました" }, { status: 500 });
  }
}
