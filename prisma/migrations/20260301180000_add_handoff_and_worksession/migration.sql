-- Folder: 引き継ぎ関連カラム追加
ALTER TABLE "Folder" ADD COLUMN "handoffStatus" TEXT;
ALTER TABLE "Folder" ADD COLUMN "handoffBy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Folder" ADD COLUMN "handoffAt" DATETIME;

-- WorkSession テーブル作成
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT '',
    "userRole" TEXT NOT NULL DEFAULT '',
    "folderId" TEXT,
    "folderName" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "totalSec" INTEGER NOT NULL DEFAULT 0,
    "documentCount" INTEGER NOT NULL DEFAULT 0
);

-- WorkLog テーブル作成
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT '',
    "userRole" TEXT NOT NULL DEFAULT '',
    "folderId" TEXT,
    "folderName" TEXT NOT NULL DEFAULT '',
    "documentId" TEXT,
    "action" TEXT NOT NULL,
    "workType" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
