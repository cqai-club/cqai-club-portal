-- CreateTable
CREATE TABLE "CollectionSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "displayName" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "payloadJson" TEXT NOT NULL,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" DATETIME,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SubmissionAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubmissionAsset_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "CollectionSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CollectionSubmission_type_idx" ON "CollectionSubmission"("type");

-- CreateIndex
CREATE INDEX "CollectionSubmission_status_idx" ON "CollectionSubmission"("status");

-- CreateIndex
CREATE INDEX "CollectionSubmission_createdAt_idx" ON "CollectionSubmission"("createdAt");

-- CreateIndex
CREATE INDEX "SubmissionAsset_submissionId_idx" ON "SubmissionAsset"("submissionId");
