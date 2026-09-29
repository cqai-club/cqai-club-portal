# 生产部署与资源门禁

生产发布由 `.github/workflows/deploy.yml` 完成，并且只部署已经通过 CI 的精确提交。

发布流程：

1. GitHub Actions 检出通过 CI 的提交 SHA。
2. Actions 使用 Buildx 构建镜像，并以该 SHA 为不可变标签推送到 GHCR。
3. 生产机通过本次 Actions 任务的短期令牌拉取镜像，不再接收源码包，也不执行 `docker build`。
4. 拉取前运行一次资源门禁；拉取后、候选实例启动前再运行一次。
5. 候选实例通过健康检查、官网、项目广场、项目详情和公开项目 API 检查后才备份数据库并切流，失败时沿用原有回滚流程。

## 项目广场终审权限与升级

部署新版本前，须先在 Logto 的 API 资源 `https://cqaiclub.asia/` 上创建 `project:publish` 权限，只授予超级管理员角色。应用会请求这个资源权限；配置后请让超级管理员重新登录，以获取包含新权限的资源令牌。`member:admin` 仍用于项目资料编辑，不能代替终审权限。

本次项目审核迁移会把原来 `published`、但没有可核实终审记录的项目转为 `pending_review`。公开 API、项目广场和官网首页会暂时隐藏这些项目；超级管理员须逐条核对项目内容、三选一对外状态和联系策略，再在后台点击“审核并发布”。请在发布窗口安排复核，避免项目区域长时间为空。迁移不会把旧项目自动标记为已审核。

会员提交项目的内部联系方式仅供后台使用，公开页面统一引导联系俱乐部。已发布项目的直接编辑和封面替换也要求 `project:publish`，并更新终审记录。

## 活动管理权限与回顾图片

活动管理使用门户 API 资源上的 `activity:publish` 权限。先在 Logto 创建该权限并只授予活动管理员，再在生产环境设置 `CQAI_ACTIVITY_PUBLISH_SCOPE_ENABLED=true`，让管理员重新登录以获取新资源令牌。未完成配置时，公开活动页仍可访问，但管理入口不会出现。

活动回顾最多上传 6 张图片，每张不超过 5 MiB。生产 Nginx 的 `/api/v1/activities/<id>/recap` 路由需要独立的 `31m` 请求上限；其他路由继续使用 `6m`。在合并发布前同步 `deploy/nginx-club.conf` 到生产站点配置，先运行 `nginx -t`，再 reload。发布流程会在切流前用 7 MiB 请求验证该路由已放行，发布后再次验证请求到达应用认证层。

## 存储与资源门禁

资料征集附件、项目封面和活动图片共用持久化挂载 `$CQAI_STORAGE_DIR`，分别保存在 `uploads/collection`、`uploads/projects` 和 `uploads/activities`。写入时会创建活动图片目录，回滚容器继续复用同一挂载。替换封面不会立即删除旧文件，避免数据库回滚或历史备份恢复后出现断图；无引用文件只能在相关数据库备份过期后清理。Nginx 的普通路由上限为 6 MiB，以容纳项目封面 multipart 开销；应用层仍将项目封面严格限制为 JPG/PNG 且不超过 5 MiB。自动部署不会安装系统 Nginx 配置，须在发布前人工同步并通过 `nginx -t`；切换前后的公网 Smoke Test 使用完整 5 MiB 未授权上传探针区分应用响应与代理 413。

资源门禁默认值：

| 检查项 | 默认要求 | 环境变量 |
| --- | --- | --- |
| 可用磁盘 | 至少 10 GiB | `CQAI_MIN_DISK_AVAILABLE_KIB` |
| 磁盘使用率 | 低于 75% | `CQAI_MAX_DISK_USAGE_PERCENT` |
| inode 使用率 | 低于 80% | `CQAI_MAX_INODE_USAGE_PERCENT` |
| 可用内存 | 至少 1.5 GiB | `CQAI_MIN_MEMORY_AVAILABLE_KIB` |

任一门禁失败时，部署会在候选实例和数据库变更之前退出，日志会打印当前测量值和失败项。门禁退出码为 `10`。部署锁仍使用 `$CQAI_DEPLOY_BASE/deploy.lock`，同一时间只允许一次生产发布。

阈值可通过生产机执行远程脚本时注入同名环境变量覆盖。除非服务器容量规划发生变化，不建议降低默认值。
