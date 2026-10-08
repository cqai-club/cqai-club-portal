---
name: cqai-club-submit-plugin
description: 将已发布到公开 npm 的插件投稿到 CQAI Club 市场，查询本人投稿与审核结果。用于市场投稿，不负责 npm 发布或管理员上架。
---

# 插件投稿

使用已连接的 CQAI Club MCP，先读取实际工具 schema。认证失败时提示重新登录；权限或连接问题如实报告，不能将本地 JSON 文件表述为已投稿。

核对 npm `packageName`、`displayName`、`summary`；可选资料为 Markdown `description`、`categories`、`keywords`、真实 HTTPS `repositoryUrl`/`homepageUrl`/`iconUrl`、`compatibilityApiVersion`、`compatibilityHosts`。以实际包元数据、README 和用户补充为依据，未知兼容性不编造。分类使用服务 schema 允许的 ID；图标只用合法公开 HTTPS 来源。

先调用 `club_validate_plugin_package({ packageName })` 核验公开 npm 包存在及下载来源。包不存在、校验失败或用户只给本地项目时，说明 npm 发布是独立步骤，在用户要求的范围内整理缺项；不能自动构建、执行包代码或 `npm publish`，也不能虚构“已发布 npm”。再用 `club_my_plugin_submissions()` 检查同名投稿。已有 pending 投稿先回读，不能换请求键重复提交。

首次投稿前，把操作目的、完整 `input` 和随机 UUID `requestKey` 保存在当前可写的持久工作目录，例如 `.cqai-club/operations/plugin-<package-name-hash>.json`。相同投稿重试使用原键和原参数；用户修改内容是新操作，保留旧记录。记录不含令牌、不提交 Git；没有可持久位置时先建立可写持久位置。

用户明确要求投稿时调用 `club_submit_plugin({ input, requestKey })`。写回官网返回的真实投稿 ID，再调用 `club_get_plugin_submission({ id })` 查询当前状态，避免将幂等响应中的旧快照当成最新结果。查询所有本人投稿可用 `club_my_plugin_submissions()`；投稿列表链接可能要求浏览器 Session，优先通过 MCP 查询。

准确区分 `pending`（待审核）、`rejected`（拒绝及真实审核说明）、`approved`（审核通过并生成市场草稿）。approved 不代表已上架，市场发布是独立管理员操作；npm 发布也独立于投稿与上架。返回真实投稿 ID、当前状态、关联插件 ID及服务返回的链接。只有公开目录实际可读且状态已发布时才能称已上架。
