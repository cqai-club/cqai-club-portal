-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceSubmissionId" TEXT,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "name" TEXT NOT NULL,
    "ownerName" TEXT,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "stage" TEXT,
    "focus" TEXT,
    "collaborationNeeds" TEXT,
    "demoUrl" TEXT,
    "internalContact" TEXT,
    "publicContactType" TEXT NOT NULL DEFAULT 'club',
    "publicContactValue" TEXT,
    "coverStorageKey" TEXT,
    "coverOriginalName" TEXT,
    "coverMimeType" TEXT,
    "coverSize" INTEGER,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "featuredOrder" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    CONSTRAINT "Project_sourceSubmissionId_fkey" FOREIGN KEY ("sourceSubmissionId") REFERENCES "CollectionSubmission" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_sourceSubmissionId_key" ON "Project"("sourceSubmissionId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Project_featured_featuredOrder_idx" ON "Project"("featured", "featuredOrder");

-- CreateIndex
CREATE INDEX "Project_publishedAt_idx" ON "Project"("publishedAt");

-- Published homepage positions are unique; drafts may reserve the same value
-- until an administrator actually publishes one of them.
CREATE UNIQUE INDEX "Project_published_featured_order_key"
ON "Project"("featuredOrder")
WHERE "status" = 'published' AND "featured" = 1 AND "featuredOrder" IS NOT NULL;

-- Enforce the homepage capacity in SQLite itself so concurrent requests or
-- multiple application processes cannot publish a seventh featured project.
CREATE TRIGGER "Project_featured_limit_insert"
BEFORE INSERT ON "Project"
WHEN NEW."status" = 'published'
  AND NEW."featured" = 1
  AND (SELECT COUNT(*) FROM "Project" WHERE "status" = 'published' AND "featured" = 1) >= 6
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_FEATURED_LIMIT');
END;

CREATE TRIGGER "Project_featured_limit_update"
BEFORE UPDATE OF "status", "featured" ON "Project"
WHEN NEW."status" = 'published'
  AND NEW."featured" = 1
  AND (SELECT COUNT(*) FROM "Project" WHERE "status" = 'published' AND "featured" = 1 AND "id" <> NEW."id") >= 6
BEGIN
  SELECT RAISE(ABORT, 'PROJECT_FEATURED_LIMIT');
END;

-- Seed the six projects previously hard-coded on the official homepage.
-- Stable IDs and INSERT OR IGNORE keep test fixtures and restored databases
-- deterministic without duplicating content.
INSERT OR IGNORE INTO "Project" (
  "id", "slug", "status", "name", "summary", "description",
  "publicContactType", "coverStorageKey", "coverOriginalName",
  "coverMimeType", "coverSize", "featured", "featuredOrder",
  "createdAt", "updatedAt", "publishedAt"
) VALUES
  (
    'seed-project-logic-garden', 'logic-garden', 'published',
    '理园LogicGarden——私家园林智慧平台',
    '中国首个软硬一体化的园林全生命周期平台，覆盖设计、营造、养护全流程，用AI让私家园林管理更简单。',
    '中国首个软硬一体化的园林全生命周期平台，覆盖设计、营造、养护全流程，用AI让私家园林管理更简单。',
    'club', 'bundled:project-1.jpg', 'project-1.jpg', 'image/jpeg', 70894,
    1, 1, 1789430400000, 1789430400000, 1789430400000
  ),
  (
    'seed-project-yifan-data-help', 'yifan-data-help', 'published',
    'YIFAN数据帮',
    '连接数据需求方与供给方，提供数据资源共享与众包服务，降低AI开发的数据获取门槛。',
    '连接数据需求方与供给方，提供数据资源共享与众包服务，降低AI开发的数据获取门槛。',
    'club', 'bundled:project-2.jpg', 'project-2.jpg', 'image/jpeg', 45321,
    1, 2, 1789430400000, 1789430400000, 1789430400000
  ),
  (
    'seed-project-contract-review', 'international-contract-review', 'published',
    '国际工程和国际贸易智能合同审查平台',
    '基于大模型+法律知识库，自动识别国际工程与贸易合同中的风险条款、缺失要素，生成专业审查报告。',
    '基于大模型+法律知识库，自动识别国际工程与贸易合同中的风险条款、缺失要素，生成专业审查报告。',
    'club', 'bundled:project-3.jpg', 'project-3.jpg', 'image/jpeg', 32728,
    1, 3, 1789430400000, 1789430400000, 1789430400000
  ),
  (
    'seed-project-megaself', 'megaself', 'published',
    'MegaSelf——个人深度IP定制网站',
    '为个人提供深度IP定制建站服务，帮助用户在AI时代打造独特的个人品牌形象与数字资产。',
    '为个人提供深度IP定制建站服务，帮助用户在AI时代打造独特的个人品牌形象与数字资产。',
    'club', 'bundled:project-4.jpg', 'project-4.jpg', 'image/jpeg', 36168,
    1, 4, 1789430400000, 1789430400000, 1789430400000
  ),
  (
    'seed-project-hairstyle', 'ai-hairstyle-design', 'published',
    'AI智能发型设计系统',
    '基于发质、脸型、长度等维度，AI推荐最适合的发型风格与修剪方案，重新定义美发体验。',
    '基于发质、脸型、长度等维度，AI推荐最适合的发型风格与修剪方案，重新定义美发体验。',
    'club', 'bundled:project-5.jpg', 'project-5.jpg', 'image/jpeg', 56128,
    1, 5, 1789430400000, 1789430400000, 1789430400000
  ),
  (
    'seed-project-dredging-robot', 'underwater-dredging-robot', 'published',
    '家庭式水下清淤机器人',
    '小型具身智能设备，自动探测管道堵塞位置并实施清淤作业，让每个家庭拥有自己的管道医生。',
    '小型具身智能设备，自动探测管道堵塞位置并实施清淤作业，让每个家庭拥有自己的管道医生。',
    'club', 'bundled:project-6.jpg', 'project-6.jpg', 'image/jpeg', 35960,
    1, 6, 1789430400000, 1789430400000, 1789430400000
  );
