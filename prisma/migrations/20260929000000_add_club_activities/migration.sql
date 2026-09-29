CREATE TABLE "ClubActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'offline',
    "location" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
    "registrationOpensAt" DATETIME NOT NULL,
    "registrationClosesAt" DATETIME NOT NULL,
    "capacity" INTEGER NOT NULL,
    "registeredCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdByIssuer" TEXT NOT NULL,
    "createdBySub" TEXT NOT NULL,
    "updatedByIssuer" TEXT,
    "updatedBySub" TEXT,
    "publishedAt" DATETIME,
    "cancelledAt" DATETIME,
    "detailsChangedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ClubActivityRegistration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "userIssuer" TEXT NOT NULL,
    "userSub" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "cancelledAt" DATETIME,
    CONSTRAINT "ClubActivityRegistration_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ClubActivity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ClubActivityAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "actorIssuer" TEXT NOT NULL,
    "actorSub" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubActivityAudit_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ClubActivity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ClubActivity_status_startsAt_idx" ON "ClubActivity"("status", "startsAt");
CREATE INDEX "ClubActivity_deletedAt_idx" ON "ClubActivity"("deletedAt");
CREATE INDEX "ClubActivityRegistration_userIssuer_userSub_idx" ON "ClubActivityRegistration"("userIssuer", "userSub");
CREATE UNIQUE INDEX "ClubActivityRegistration_activityId_userIssuer_userSub_key" ON "ClubActivityRegistration"("activityId", "userIssuer", "userSub");
CREATE INDEX "ClubActivityAudit_activityId_createdAt_idx" ON "ClubActivityAudit"("activityId", "createdAt");

-- Reject a counter that exceeds capacity or drops below zero.
CREATE TRIGGER "ClubActivity_registration_capacity_update"
BEFORE UPDATE OF "registeredCount", "capacity" ON "ClubActivity"
WHEN NEW."registeredCount" < 0 OR NEW."registeredCount" > NEW."capacity"
BEGIN
  SELECT RAISE(ABORT, 'CLUB_ACTIVITY_CAPACITY');
END;
