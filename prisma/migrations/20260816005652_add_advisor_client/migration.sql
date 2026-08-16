-- CreateTable
CREATE TABLE "AdvisorClient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdvisorClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AdvisorClient_userId_idx" ON "AdvisorClient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorClient_userId_clientId_key" ON "AdvisorClient"("userId", "clientId");
