-- CreateTable
CREATE TABLE "MemberApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "wechat" TEXT NOT NULL,
    "email" TEXT,
    "organization" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "orgType" TEXT NOT NULL,
    "orgTypeOther" TEXT,
    "provideResources" TEXT NOT NULL,
    "provideResourcesOther" TEXT,
    "needResources" TEXT NOT NULL,
    "needResourcesOther" TEXT,
    "joinPurpose" TEXT NOT NULL,
    "joinPurposeOther" TEXT,
    "expectEvents" TEXT NOT NULL,
    "expectEventsOther" TEXT,
    "timePreference" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "cityOther" TEXT,
    "roleIntent" TEXT NOT NULL,
    "bio" TEXT,
    "privacyPreference" TEXT NOT NULL,
    "isHighValue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberApplication_phone_key" ON "MemberApplication"("phone");
