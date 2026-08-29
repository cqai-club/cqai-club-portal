# 重庆 AI 创享俱乐部门户部署手册

本项目是一个前后端一体化的 Node.js 应用，一个进程同时提供官网、入会申请、管理后台和 API。

## 1. 项目结构

| 模块 | 线上路径 | 源码位置 |
|---|---|---|
| 俱乐部官网 | `/` | `web/index.html`、`web/images/` |
| 入会申请 | `/apply/` | `public/index.html` |
| 管理后台 | `/admin/` | `public/admin.html` |
| 后端接口 | `/api/*` | `index.js` |
| 健康检查 | `/health` | `index.js` |
| 数据库 | - | Prisma + SQLite |

官网中的“入会申请”按钮使用站内 `/apply/` 地址，因此本地、测试和正式环境不需要分别修改域名。

## 2. 运行环境

- Node.js 20 LTS
- npm
- Linux、macOS 或 Windows
- 生产环境使用 Docker 和 Nginx

## 3. 本地启动

```bash
npm ci
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm start
```

启动后访问：

- 官网：`http://localhost:3000/`
- 入会申请：`http://localhost:3000/apply/`
- 管理后台：`http://localhost:3000/admin/`
- 健康检查：`http://localhost:3000/health`

旧的 `/admin.html` 地址仍然可用，便于兼容已有书签。

## 4. 环境变量

复制 `.env.example` 为 `.env` 后修改：

```dotenv
DATABASE_URL="file:./dev.db"
PORT=3000
ADMIN_USERNAME="change-me"
ADMIN_PASSWORD="use-a-long-random-password"
```

- `DATABASE_URL`：SQLite 文件地址。默认文件位于 `prisma/dev.db`。
- `PORT`：服务监听端口。
- `ADMIN_USERNAME`：管理后台账号。
- `ADMIN_PASSWORD`：管理后台密码，生产环境必须换成长随机密码。

`.env` 和 SQLite 数据库均已被 Git 忽略，禁止手动加入版本库。

## 5. 当前生产架构

- 域名：`https://cqaiclub.asia`
- Nginx：负责 HTTPS，并把所有路径代理到 `127.0.0.1:3000`
- 应用：单个 Docker 容器，同时提供官网、报名表、后台和 API
- 数据库：服务器 `/data/informationCollection/prisma/dev.db`
- 环境变量：服务器 `/data/informationCollection/.env`
- 旧官网：服务器 `/var/www/club`，仅作为回滚副本保留

端口 3000 只绑定回环地址，不直接暴露到公网。

## 6. GitHub Actions 自动部署

部署工作流为 `.github/workflows/deploy.yml`。它只发布通过 `CI` 的 `main` 提交，并按以下顺序执行：

1. 打包已测试的提交，排除 `.env`、SQLite 和本地文件。
2. 上传到服务器 `/data/cqai-club-portal/incoming/`。
3. 构建带提交 SHA 标签的 Docker 镜像。
4. 复制生产数据库，用副本运行迁移并检查 `/`、`/apply/`、`/admin/` 和 `/health`。
5. 备份正式数据库，将旧容器保留为 `cqai-club-portal-rollback`。
6. 迁移正式数据库并启动新容器；失败时恢复数据库和旧容器。
7. 从公网再次检查正式域名。

仓库需要创建 `production` Environment，并配置：

| 类型 | 名称 | 值 |
|---|---|---|
| Repository variable | `DEPLOY_HOST` | `8.137.71.156` |
| Repository variable | `DEPLOY_USER` | `cqai-deploy` |
| Repository variable | `DEPLOY_PORT` | `22` |
| Repository variable | `DEPLOY_ENABLED` | 首次上线前为 `false`，验证后改为 `true` |
| Environment secret | `DEPLOY_SSH_KEY` | 专用部署私钥 |
| Environment secret | `DEPLOY_KNOWN_HOSTS` | 服务器 SSH 主机公钥记录 |

部署必须使用专用的 `cqai-deploy` 账号和密钥，不复用个人 root 密钥。该账号需要 Docker 权限，以及下列目录和生产数据文件的最小读写权限：

```text
/data/cqai-club-portal/incoming
/data/cqai-club-portal/releases
/data/cqai-club-portal/backups
/data/cqai-club-portal/tmp
/data/informationCollection/.env
/data/informationCollection/prisma/dev.db
```

首次上线时，先保持 `DEPLOY_ENABLED=false`，手动执行工作流并完成 Nginx 切换。确认官网、报名表、后台和健康检查均正常后，再开启自动部署。旧 Nginx 的 `/apply/` 规则会去掉路径前缀，因此不能在统一应用上线后继续保留。

## 7. 手动部署（备用）

正常情况下应在 GitHub 仓库的 Actions 页面手动运行 `Deploy production`。如果 GitHub 暂时不可用，可在可信机器上打包当前提交并上传，然后在服务器执行同一部署脚本：

```bash
git archive --format=tar.gz --output=release.tgz HEAD
scp release.tgz cqai-deploy@8.137.71.156:/data/cqai-club-portal/incoming/<完整提交SHA>.tgz
scp deploy/remote-deploy.sh cqai-deploy@8.137.71.156:/data/cqai-club-portal/incoming/remote-deploy-<完整提交SHA>.sh
```

然后登录服务器执行：

```bash
bash /data/cqai-club-portal/incoming/remote-deploy-<完整提交SHA>.sh <完整提交SHA>
```

脚本仍会执行候选验证、数据库在线备份、迁移和失败回滚。不要绕过脚本直接替换生产数据库或容器。

## 8. Nginx 反向代理

```nginx
server {
    listen 80;
    server_name cqaiclub.asia;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

仓库中的 `deploy/nginx-club.conf` 是正式配置模板。替换配置前必须备份旧文件，运行 `nginx -t` 成功后才能 reload；验证失败时恢复备份。正式环境应配置 HTTPS，不要直接把 Node.js 端口暴露到公网。

## 9. API

### `POST /api/apply`

提交入会申请。服务端会校验必填字段、手机号、资源选项和活动选项，同一 IP 每分钟最多提交 5 次。

### `POST /api/admin/login`

使用 `.env` 中的管理员账号登录，成功后返回有效期 8 小时的临时 Bearer Token。服务重启后需要重新登录。

### `GET /api/admin/members`

查询申请记录，需要 Bearer Token。支持 `page`、`limit`、`orgType`、`city` 和 `isHighValue`；单页最多返回 100 条。

### `GET /api/admin/members/export`

导出 UTF-8 CSV，需要 Bearer Token。导出内容会处理可能被 Excel 识别为公式的用户输入。

## 10. 安全与数据

- 官网、报名表和后台为同源访问，默认不开放跨域调用。
- 管理后台页面可以公开访问，但会员 API 必须登录后才能调用。
- SQLite 数据包含姓名、手机号、微信、邮箱和单位等个人信息，应限制文件权限并定期备份。
- 不要把 `.env`、数据库备份、服务器日志或导出的会员 CSV 上传到 GitHub。
- 如需迁移到 PostgreSQL/MySQL，必须重新设计 Prisma datasource 和迁移文件，不能只替换连接地址。

## 11. 自动检查

每次推送到 `main` 或创建 Pull Request 时，GitHub Actions 会运行：

```bash
npm ci
npm test
```

测试使用独立的临时 SQLite 数据库，不读取或修改本地及生产会员数据。
