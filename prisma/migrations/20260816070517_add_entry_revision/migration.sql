-- CreateTable
CREATE TABLE "EntryRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL DEFAULT '',
    "changedByName" TEXT NOT NULL DEFAULT '',
    "changedByKind" TEXT NOT NULL DEFAULT 'tax_advisor',
    "changes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EntryRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EntryRevision_entryId_idx" ON "EntryRevision"("entryId");
