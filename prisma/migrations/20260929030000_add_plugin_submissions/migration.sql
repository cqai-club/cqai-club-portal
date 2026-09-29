CREATE TABLE "PluginSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "packageName" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "submittedByIssuer" TEXT NOT NULL,
    "submittedBySub" TEXT NOT NULL,
    "submittedByName" TEXT,
    "reviewedByIssuer" TEXT,
    "reviewedBySub" TEXT,
    "reviewNote" TEXT,
    "pluginId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "reviewedAt" DATETIME,
    CONSTRAINT "PluginSubmission_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "Plugin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PluginSubmission_pluginId_key" ON "PluginSubmission"("pluginId");
CREATE INDEX "PluginSubmission_status_createdAt_idx" ON "PluginSubmission"("status", "createdAt");
CREATE INDEX "PluginSubmission_packageName_idx" ON "PluginSubmission"("packageName");
CREATE INDEX "PluginSubmission_submittedByIssuer_submittedBySub_createdAt_idx" ON "PluginSubmission"("submittedByIssuer", "submittedBySub", "createdAt");
CREATE UNIQUE INDEX "PluginSubmission_one_pending_package_key" ON "PluginSubmission"("packageName") WHERE "status" = 'pending';
