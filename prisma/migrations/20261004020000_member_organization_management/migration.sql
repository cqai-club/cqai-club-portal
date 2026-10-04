CREATE TABLE "MemberOrganizationBinding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "organizationName" TEXT,
  "validatedAt" DATETIME,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "MemberOrganizationBinding_organizationId_key" ON "MemberOrganizationBinding"("organizationId");
INSERT INTO "MemberOrganizationBinding" ("id", "name", "organizationId", "updatedAt")
VALUES ('innovation', '创新会员', 'rar9vrcnuavh', CURRENT_TIMESTAMP);
CREATE TABLE "MemberOrganizationJoin" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorIssuer" TEXT NOT NULL,
  "actorSub" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "confirmedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MemberOrganizationJoin_organizationId_userId_key" ON "MemberOrganizationJoin"("organizationId", "userId");
ALTER TABLE "MemberApplication" ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "MemberApplication" ADD COLUMN "reviewNote" TEXT;
ALTER TABLE "MemberApplication" ADD COLUMN "reviewedByIssuer" TEXT;
ALTER TABLE "MemberApplication" ADD COLUMN "reviewedBySub" TEXT;
ALTER TABLE "MemberApplication" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "MemberApplication" ADD COLUMN "membershipState" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "MemberApplication" ADD COLUMN "membershipOrganizationId" TEXT;
ALTER TABLE "MemberApplication" ADD COLUMN "membershipAttemptId" TEXT;
ALTER TABLE "MemberApplication" ADD COLUMN "membershipStartedAt" DATETIME;
ALTER TABLE "MemberApplication" ADD COLUMN "membershipError" TEXT;
