-- Legacy applications stay unbound. A phone entered in a new application is
-- not proof of ownership and must never be used to claim an existing row.
ALTER TABLE "MemberApplication" ADD COLUMN "userIssuer" TEXT;
ALTER TABLE "MemberApplication" ADD COLUMN "userSub" TEXT;

CREATE UNIQUE INDEX "MemberApplication_userIssuer_userSub_key"
ON "MemberApplication"("userIssuer", "userSub");
