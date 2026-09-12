-- CreateTable
CREATE TABLE "Plugin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "packageName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT,
    "categoriesJson" TEXT NOT NULL DEFAULT '[]',
    "keywordsJson" TEXT NOT NULL DEFAULT '[]',
    "repositoryUrl" TEXT,
    "homepageUrl" TEXT,
    "iconUrl" TEXT,
    "compatibilityApiVersion" TEXT,
    "compatibilityHostsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "Plugin_packageName_key" ON "Plugin"("packageName");

-- CreateIndex
CREATE INDEX "Plugin_status_idx" ON "Plugin"("status");

-- CreateIndex
CREATE INDEX "Plugin_updatedAt_idx" ON "Plugin"("updatedAt");
