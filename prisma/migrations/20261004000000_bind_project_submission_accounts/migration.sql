-- One account can own multiple submissions. Historical anonymous submissions
-- remain unbound; names, contact details and client payloads do not prove ownership.
ALTER TABLE "CollectionSubmission" ADD COLUMN "userIssuer" TEXT;
ALTER TABLE "CollectionSubmission" ADD COLUMN "userSub" TEXT;

CREATE INDEX "CollectionSubmission_userIssuer_userSub_type_createdAt_idx"
ON "CollectionSubmission"("userIssuer", "userSub", "type", "createdAt");
