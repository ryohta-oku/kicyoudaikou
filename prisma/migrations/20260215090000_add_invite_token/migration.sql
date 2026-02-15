-- AlterTable
ALTER TABLE "User" ADD COLUMN "inviteToken" TEXT;
ALTER TABLE "User" ADD COLUMN "inviteTokenExpiry" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteToken_key" ON "User"("inviteToken");
