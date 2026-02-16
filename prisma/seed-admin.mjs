import { PrismaClient } from "../src/generated/prisma/index.js";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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
await prisma.$disconnect();
