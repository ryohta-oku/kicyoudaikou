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
    "noRegistrationNumber" BOOLEAN NOT NULL DEFAULT false,
    "isDoubleChecked" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DocumentPage" ("amount", "correctedText", "date", "documentId", "id", "imageData", "imagePath", "isConfirmed", "isDoubleChecked", "memo", "ocrText", "pageNumber", "registrationNumber", "tax") SELECT "amount", "correctedText", "date", "documentId", "id", "imageData", "imagePath", "isConfirmed", "isDoubleChecked", "memo", "ocrText", "pageNumber", "registrationNumber", "tax" FROM "DocumentPage";
DROP TABLE "DocumentPage";
ALTER TABLE "new_DocumentPage" RENAME TO "DocumentPage";
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
