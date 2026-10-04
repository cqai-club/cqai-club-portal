CREATE TABLE "MemberResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "externalUrl" TEXT NOT NULL,
    "imageStorageKey" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "MemberResource_published_createdAt_idx" ON "MemberResource"("published", "createdAt");
