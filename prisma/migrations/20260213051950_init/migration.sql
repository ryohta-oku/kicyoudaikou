-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "imagePath" TEXT NOT NULL,
    "ocrText" TEXT NOT NULL DEFAULT '',
    "correctedText" TEXT NOT NULL DEFAULT '',
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalEntry" (
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
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JournalEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SubAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "SubAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SubAccount_accountId_code_key" ON "SubAccount"("accountId", "code");
