CREATE TABLE "ClubActivityContentImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "size" INTEGER NOT NULL,
    "createdByIssuer" TEXT NOT NULL,
    "createdBySub" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ClubActivityContentImage_storageKey_key" ON "ClubActivityContentImage"("storageKey");
CREATE INDEX "ClubActivityContentImage_createdByIssuer_createdBySub_createdAt_idx" ON "ClubActivityContentImage"("createdByIssuer", "createdBySub", "createdAt");
