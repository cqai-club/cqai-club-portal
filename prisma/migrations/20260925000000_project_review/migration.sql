ALTER TABLE "Project" ADD COLUMN "reviewedAt" DATETIME;
ALTER TABLE "Project" ADD COLUMN "reviewedBy" TEXT;

-- Existing published content has no verifiable super-admin approval. Keep
-- its content and recommendation order, but require a fresh review before it
-- becomes public again.
UPDATE "Project" SET "status" = 'pending_review' WHERE "status" = 'published';
