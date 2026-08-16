-- CreateTable
CREATE TABLE "TaxReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "reviewedBy" TEXT NOT NULL DEFAULT '',
    "reviewedByName" TEXT NOT NULL DEFAULT '',
    "reviewerKind" TEXT NOT NULL DEFAULT 'tax_advisor',
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxReview_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "taxReviewStatus" TEXT,
    "taxReviewedBy" TEXT NOT NULL DEFAULT '',
    "taxReviewedByName" TEXT NOT NULL DEFAULT '',
    "taxReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Folder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Folder" ("clientId", "createdAt", "creator", "doubleCheckAt", "doubleCheckById", "doubleCheckByName", "doubleCheckStatus", "firstCheckAt", "firstCheckById", "firstCheckByName", "handoffAt", "handoffBy", "handoffStatus", "id", "name", "needsDoubleCheck", "updatedAt") SELECT "clientId", "createdAt", "creator", "doubleCheckAt", "doubleCheckById", "doubleCheckByName", "doubleCheckStatus", "firstCheckAt", "firstCheckById", "firstCheckByName", "handoffAt", "handoffBy", "handoffStatus", "id", "name", "needsDoubleCheck", "updatedAt" FROM "Folder";
DROP TABLE "Folder";
ALTER TABLE "new_Folder" RENAME TO "Folder";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TaxReview_entryId_key" ON "TaxReview"("entryId");
