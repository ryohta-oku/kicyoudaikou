-- CreateTable
CREATE TABLE "PageSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL DEFAULT '',
    "registrationNumber" TEXT NOT NULL DEFAULT '',
    "amount" TEXT NOT NULL DEFAULT '',
    "tax" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageSnapshot_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DocumentPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "imagePath" TEXT NOT NULL,
    "imageData" BLOB,
    "ocrText" TEXT NOT NULL DEFAULT '',
    "correctedText" TEXT NOT NULL DEFAULT '',
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "date" TEXT NOT NULL DEFAULT '',
    "registrationNumber" TEXT NOT NULL DEFAULT '',
    "amount" TEXT NOT NULL DEFAULT '',
    "tax" TEXT NOT NULL DEFAULT '',
    "memo" TEXT NOT NULL DEFAULT '',
    "isDoubleChecked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DocumentPage" ("amount", "correctedText", "date", "documentId", "id", "imageData", "imagePath", "isConfirmed", "memo", "ocrText", "pageNumber", "registrationNumber", "tax") SELECT "amount", "correctedText", "date", "documentId", "id", "imageData", "imagePath", "isConfirmed", "memo", "ocrText", "pageNumber", "registrationNumber", "tax" FROM "DocumentPage";
DROP TABLE "DocumentPage";
ALTER TABLE "new_DocumentPage" RENAME TO "DocumentPage";
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");
CREATE TABLE "new_Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "creator" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT,
    "handoffStatus" TEXT,
    "handoffBy" TEXT NOT NULL DEFAULT '',
    "handoffAt" DATETIME,
    "doubleCheckStatus" TEXT,
    "firstCheckById" TEXT NOT NULL DEFAULT '',
    "firstCheckByName" TEXT NOT NULL DEFAULT '',
    "firstCheckAt" DATETIME,
    "doubleCheckById" TEXT NOT NULL DEFAULT '',
    "doubleCheckByName" TEXT NOT NULL DEFAULT '',
    "doubleCheckAt" DATETIME,
    "needsDoubleCheck" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Folder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Folder" ("clientId", "createdAt", "creator", "handoffAt", "handoffBy", "handoffStatus", "id", "name", "updatedAt") SELECT "clientId", "createdAt", "creator", "handoffAt", "handoffBy", "handoffStatus", "id", "name", "updatedAt" FROM "Folder";
DROP TABLE "Folder";
ALTER TABLE "new_Folder" RENAME TO "Folder";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PageSnapshot_pageId_key" ON "PageSnapshot"("pageId");
