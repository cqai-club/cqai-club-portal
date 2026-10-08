CREATE TABLE "ClubMcpOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorIssuer" TEXT NOT NULL,
    "actorSub" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ClubMcpOperation_actorIssuer_actorSub_tool_requestKey_key" ON "ClubMcpOperation"("actorIssuer", "actorSub", "tool", "requestKey");
CREATE INDEX "ClubMcpOperation_createdAt_idx" ON "ClubMcpOperation"("createdAt");

CREATE TABLE "ClubMcpSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorIssuer" TEXT NOT NULL,
    "actorSub" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "title" TEXT,
    "activityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClubMcpSource_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ClubActivity"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClubMcpSource_actorIssuer_actorSub_sourceKey_key" ON "ClubMcpSource"("actorIssuer", "actorSub", "sourceKey");
CREATE INDEX "ClubMcpSource_activityId_idx" ON "ClubMcpSource"("activityId");
