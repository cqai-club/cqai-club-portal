-- Preserve the existing homepage partner groups and their published translations.
CREATE TABLE "PartnerGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameZh" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "nameZh" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "url" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Partner_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PartnerGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PartnerGroup_enabled_sortOrder_idx" ON "PartnerGroup"("enabled", "sortOrder");
CREATE INDEX "Partner_groupId_enabled_sortOrder_idx" ON "Partner"("groupId", "enabled", "sortOrder");

INSERT INTO "PartnerGroup" ("id", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-group-research', '高校/科研院所', 'Universities and Research Institutes', 10, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-cqu', 'partner-group-research', '重庆大学', 'Chongqing University', 10, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-swu', 'partner-group-research', '西南大学', 'Southwest University', 20, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-pku', 'partner-group-research', '北京大学重庆大数据研究院', 'Chongqing Big Data Research Institute, Peking University', 30, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-cqmu', 'partner-group-research', '重庆医科大学', 'Chongqing Medical University', 40, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-cqupt', 'partner-group-research', '重庆邮电大学', 'Chongqing University of Posts and Telecommunications', 50, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-ctbu', 'partner-group-research', '重庆工商大学', 'Chongqing Technology and Business University', 60, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-cqjz', 'partner-group-research', '重庆建筑工程职业学院', 'Chongqing Jianzhu College', 70, CURRENT_TIMESTAMP);

INSERT INTO "PartnerGroup" ("id", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-group-companies', '企业', 'Companies', 20, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-sevnce', 'partner-group-companies', '七腾机器人', 'SEVNCE Robotics', 10, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-jiucheng', 'partner-group-companies', '重庆九城数字科技', 'Chongqing Jiucheng Digital Technology', 20, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-zhilian', 'partner-group-companies', '智联理园(重庆)科技', 'Zhilian Liyuan (Chongqing) Technology', 30, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-haigong', 'partner-group-companies', '海工核投科技', 'Haigong Hetou Technology', 40, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-jiayu', 'partner-group-companies', '重庆嘉誉澜庭茶楼', 'Chongqing Jiayu Lanting Tea House', 50, CURRENT_TIMESTAMP);

INSERT INTO "PartnerGroup" ("id", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-group-associations', '行业协会', 'Industry Associations', 30, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-mba', 'partner-group-associations', '重庆MBA企业家联合会·AI专委会', 'AI Committee, Chongqing MBA Entrepreneurs Federation', 10, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-bigdata', 'partner-group-associations', '重庆市大数据与人工智能产业协会', 'Chongqing Big Data and Artificial Intelligence Industry Association', 20, CURRENT_TIMESTAMP);

INSERT INTO "PartnerGroup" ("id", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-group-cloud', '云平台', 'Cloud Platforms', 40, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-aliyun', 'partner-group-cloud', '阿里云', 'Alibaba Cloud', 10, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-tencent', 'partner-group-cloud', '腾讯云', 'Tencent Cloud', 20, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-huawei', 'partner-group-cloud', '华为云', 'Huawei Cloud', 30, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-doubao', 'partner-group-cloud', '豆包AI', 'Doubao AI', 40, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-deepseek', 'partner-group-cloud', '深度求索', 'DeepSeek', 50, CURRENT_TIMESTAMP);
INSERT INTO "Partner" ("id", "groupId", "nameZh", "nameEn", "sortOrder", "updatedAt") VALUES ('partner-hunyuan', 'partner-group-cloud', '混元', 'Hunyuan', 60, CURRENT_TIMESTAMP);
