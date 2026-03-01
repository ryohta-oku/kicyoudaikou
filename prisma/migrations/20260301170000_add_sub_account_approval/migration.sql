-- AlterTable
ALTER TABLE "SubAccount" ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT 0;

-- 既存の補助科目を全て承認済みにする
UPDATE "SubAccount" SET "isApproved" = 1;
