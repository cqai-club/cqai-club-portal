ALTER TABLE "ClubActivity" ADD COLUMN "recapTitle" TEXT;
ALTER TABLE "ClubActivity" ADD COLUMN "recapSummary" TEXT;
ALTER TABLE "ClubActivity" ADD COLUMN "recapContent" TEXT;
ALTER TABLE "ClubActivity" ADD COLUMN "recapPublishedAt" DATETIME;

CREATE TABLE "ClubActivityRecapImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "size" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubActivityRecapImage_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ClubActivity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ClubActivity_recapPublishedAt_endsAt_idx" ON "ClubActivity"("recapPublishedAt", "endsAt");
CREATE UNIQUE INDEX "ClubActivityRecapImage_storageKey_key" ON "ClubActivityRecapImage"("storageKey");
CREATE INDEX "ClubActivityRecapImage_activityId_position_idx" ON "ClubActivityRecapImage"("activityId", "position");
