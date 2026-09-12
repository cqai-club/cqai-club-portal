# 生产部署与资源门禁

生产发布由 `.github/workflows/deploy.yml` 完成，并且只部署已经通过 CI 的精确提交。

发布流程：

1. GitHub Actions 检出通过 CI 的提交 SHA。
2. Actions 使用 Buildx 构建镜像，并以该 SHA 为不可变标签推送到 GHCR。
3. 生产机通过本次 Actions 任务的短期令牌拉取镜像，不再接收源码包，也不执行 `docker build`。
4. 拉取前运行一次资源门禁；拉取后、候选实例启动前再运行一次。
5. 候选实例通过健康检查后才备份数据库并切流，失败时沿用原有回滚流程。

资源门禁默认值：

| 检查项 | 默认要求 | 环境变量 |
| --- | --- | --- |
| 可用磁盘 | 至少 10 GiB | `CQAI_MIN_DISK_AVAILABLE_KIB` |
| 磁盘使用率 | 低于 75% | `CQAI_MAX_DISK_USAGE_PERCENT` |
| inode 使用率 | 低于 80% | `CQAI_MAX_INODE_USAGE_PERCENT` |
| 可用内存 | 至少 1.5 GiB | `CQAI_MIN_MEMORY_AVAILABLE_KIB` |

任一门禁失败时，部署会在候选实例和数据库变更之前退出，日志会打印当前测量值和失败项。门禁退出码为 `10`。部署锁仍使用 `$CQAI_DEPLOY_BASE/deploy.lock`，同一时间只允许一次生产发布。

阈值可通过生产机执行远程脚本时注入同名环境变量覆盖。除非服务器容量规划发生变化，不建议降低默认值。
