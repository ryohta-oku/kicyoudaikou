import { prisma } from "../src/lib/prisma";

const DEFAULT_ACCOUNTS = [
  // 資産
  { code: "1111", name: "現金", category: "資産" },
  { code: "1121", name: "普通預金", category: "資産" },
  { code: "1131", name: "当座預金", category: "資産" },
  { code: "1211", name: "売掛金", category: "資産" },
  { code: "1311", name: "前払費用", category: "資産" },
  { code: "1411", name: "建物", category: "資産" },
  { code: "1421", name: "車両運搬具", category: "資産" },
  { code: "1431", name: "工具器具備品", category: "資産" },
  { code: "1511", name: "仮払金", category: "資産" },
  { code: "1521", name: "仮払消費税", category: "資産" },
  // 負債
  { code: "2111", name: "買掛金", category: "負債" },
  { code: "2121", name: "未払金", category: "負債" },
  { code: "2131", name: "未払費用", category: "負債" },
  { code: "2141", name: "預り金", category: "負債" },
  { code: "2151", name: "仮受消費税", category: "負債" },
  { code: "2211", name: "短期借入金", category: "負債" },
  { code: "2311", name: "長期借入金", category: "負債" },
  // 純資産
  { code: "3111", name: "資本金", category: "純資産" },
  { code: "3211", name: "繰越利益剰余金", category: "純資産" },
  // 収益
  { code: "4111", name: "売上高", category: "収益" },
  { code: "4211", name: "受取利息", category: "収益" },
  { code: "4221", name: "雑収入", category: "収益" },
  // 費用
  { code: "5111", name: "仕入高", category: "費用" },
  { code: "7111", name: "給料手当", category: "費用" },
  { code: "7112", name: "法定福利費", category: "費用" },
  { code: "7113", name: "福利厚生費", category: "費用" },
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
  { code: "7261", name: "諸会費", category: "費用" },
  { code: "7271", name: "租税公課", category: "費用" },
  { code: "7281", name: "減価償却費", category: "費用" },
  { code: "7291", name: "支払利息", category: "費用" },
  { code: "7299", name: "雑費", category: "費用" },
];

async function main() {
  console.log("勘定科目マスターをシード中...");

  for (const account of DEFAULT_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: account.code },
      update: { name: account.name, category: account.category },
      create: account,
    });
  }

  const count = await prisma.account.count();
  console.log(`完了: ${count} 件の勘定科目を登録しました`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
