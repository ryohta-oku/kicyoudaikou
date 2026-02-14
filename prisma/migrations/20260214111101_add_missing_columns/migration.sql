-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "creator" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folderId" TEXT,
    "filename" TEXT NOT NULL,
    "filepath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT 'pdf',
    "fileData" BLOB,
    "title" TEXT NOT NULL DEFAULT '',
    "creator" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("createdAt", "filename", "filepath", "id", "status", "updatedAt") SELECT "createdAt", "filename", "filepath", "id", "status", "updatedAt" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
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
    CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DocumentPage" ("correctedText", "documentId", "id", "imagePath", "isConfirmed", "ocrText", "pageNumber") SELECT "correctedText", "documentId", "id", "imagePath", "isConfirmed", "ocrText", "pageNumber" FROM "DocumentPage";
DROP TABLE "DocumentPage";
ALTER TABLE "new_DocumentPage" RENAME TO "DocumentPage";
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
