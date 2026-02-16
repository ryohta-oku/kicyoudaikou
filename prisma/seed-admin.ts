import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";

async function main() {
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./prisma/production.db",
  });
  const prisma = new PrismaClient({ adapter });
  try {
    const count = await prisma.user.count();
    if (count === 0) {
      const hashed = await bcrypt.hash("test", 10);
      await prisma.user.create({
        data: {
          email: "o.ryohta@thank-smile.jp",
          password: hashed,
          plainPassword: "test",
          name: "奥 亮太",
          role: "admin",
        },
      });
      console.log(">>> 管理者ユーザーを作成しました");
    } else {
      console.log(">>> ユーザーが既に存在するためスキップ");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
