-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "defaultCreditAccountCode" TEXT NOT NULL DEFAULT '1111',
    "defaultCreditAccountName" TEXT NOT NULL DEFAULT '現金',
    "nonQualifiedInvoiceKind" TEXT NOT NULL DEFAULT '80%控除'
);
INSERT INTO "new_Client" ("createdAt", "createdBy", "id", "isApproved", "name", "updatedAt") SELECT "createdAt", "createdBy", "id", "isApproved", "name", "updatedAt" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
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
    "creditAccountCode" TEXT NOT NULL DEFAULT '',
    "creditAccountName" TEXT NOT NULL DEFAULT '',
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "aiReasoning" TEXT NOT NULL DEFAULT '',
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "duplicateDismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JournalEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JournalEntry" ("accountCode", "accountName", "aiReasoning", "aiSuggested", "createdAt", "creditAmount", "date", "debitAmount", "description", "documentId", "duplicateDismissed", "id", "isConfirmed", "pageId", "subAccountCode", "subAccountName", "taxRate", "updatedAt") SELECT "accountCode", "accountName", "aiReasoning", "aiSuggested", "createdAt", "creditAmount", "date", "debitAmount", "description", "documentId", "duplicateDismissed", "id", "isConfirmed", "pageId", "subAccountCode", "subAccountName", "taxRate", "updatedAt" FROM "JournalEntry";
DROP TABLE "JournalEntry";
ALTER TABLE "new_JournalEntry" RENAME TO "JournalEntry";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
