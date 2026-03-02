-- CreateTable
CREATE TABLE "DeletionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'duplicate',
    "requestedBy" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeletionRequest_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeletionRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "pageId" TEXT,
    "date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL DEFAULT '',
    "accountName" TEXT NOT NULL DEFAULT '',
    "subAccountCode" TEXT NOT NULL DEFAULT '',
    "subAccountName" TEXT NOT NULL DEFAULT '',
    "debitAmount" INTEGER NOT NULL DEFAULT 0,
    "creditAmount" INTEGER NOT NULL DEFAULT 0,
    "taxRate" TEXT NOT NULL DEFAULT '',
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "aiReasoning" TEXT NOT NULL DEFAULT '',
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "duplicateDismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JournalEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JournalEntry" ("accountCode", "accountName", "aiReasoning", "aiSuggested", "createdAt", "creditAmount", "date", "debitAmount", "description", "documentId", "id", "isConfirmed", "pageId", "subAccountCode", "subAccountName", "taxRate", "updatedAt") SELECT "accountCode", "accountName", "aiReasoning", "aiSuggested", "createdAt", "creditAmount", "date", "debitAmount", "description", "documentId", "id", "isConfirmed", "pageId", "subAccountCode", "subAccountName", "taxRate", "updatedAt" FROM "JournalEntry";
DROP TABLE "JournalEntry";
ALTER TABLE "new_JournalEntry" RENAME TO "JournalEntry";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "plainPassword" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user_b',
    "inviteToken" TEXT,
    "inviteTokenExpiry" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "inviteToken", "inviteTokenExpiry", "name", "password", "plainPassword", "role", "updatedAt") SELECT "createdAt", "email", "id", "inviteToken", "inviteTokenExpiry", "name", "password", "plainPassword", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_inviteToken_key" ON "User"("inviteToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
