# 重庆 AI 创享俱乐部门户部署手册

本项目是一个前后端一体化的 Next.js 应用，一个进程同时提供官网、入会申请、会员中心和 API。

## 1. 项目结构

| 模块 | 线上路径 | 源码位置 |
|---|---|---|
| 俱乐部官网 | `/` | `site/index.html`、`site/images/` |
| 入会申请 / 资料征集 | `/apply/`、`/collect/` | `site/apply/`、`site/collect/` |
| 项目广场 | `/projects/` | `app/projects/` |
| 会员中心 | `/member/` | `app/member/` |
| 后台管理 | `/member/dashboard/admin/*` | `app/member/dashboard/admin/` |
| 后端接口 | `/api/*` | `app/(site)/api/` |
| 健康检查 | `/api/health` | `app/(site)/api/health/route.ts` |
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
npm run dev
```

启动后访问：

- 官网：`http://localhost:3000/`
- 入会申请：`http://localhost:3000/apply/`
- 会员中心：`http://localhost:3000/member`
- 会员管理：`http://localhost:3000/member/dashboard/admin/members`（登录且具备管理员角色后可见）
- 项目广场：`http://localhost:3000/projects/`
- 健康检查：`http://localhost:3000/api/health`

旧的 `/admin/`、`/admin.html` 和 `/collection-admin.html` 地址会跳转到会员中心对应的管理页面；旧静态管理页不再提供。

## 4. 环境变量

复制 `.env.example` 为 `.env` 后修改：

```dotenv
DATABASE_URL="file:./dev.db"
PORT=3000
LOGTO_ISSUER="http://localhost:3001/oidc"
LOGTO_CLIENT_ID="..."
LOGTO_CLIENT_SECRET="..."
LOGTO_REDIRECT_URI="http://localhost:3000/auth/callback"
LOGTO_POST_LOGOUT_REDIRECT_URI="http://localhost:3000/admin/"
LOGTO_ADMIN_ROLE="club-admin"
SESSION_SECRET="..."
LEGACY_ADMIN_LOGIN_ENABLED="false"
```

- `DATABASE_URL`：SQLite 文件地址。默认文件位于 `prisma/dev.db`。
- `PORT`：服务监听端口。
- `LOGTO_ISSUER`：Logto OIDC issuer，例如本地的 `http://localhost:3001/oidc`。
- `LOGTO_CLIENT_ID` / `LOGTO_CLIENT_SECRET`：Logto Web 应用凭据。
- `LOGTO_REDIRECT_URI`：必须在 Logto 应用中登记的回调地址。
- `LOGTO_ADMIN_ROLE`：允许访问后台的 Logto 角色，默认 `club-admin`。
- `SESSION_SECRET`：服务端会话密钥。
- `LEGACY_ADMIN_LOGIN_ENABLED`：仅迁移期间临时开启旧账号密码登录，默认关闭。

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

1. 检出已经通过 CI 的精确提交 SHA，用 Buildx 构建镜像并以该 SHA 的不可变标签推送到 GHCR。
2. 只上传部署脚本与资源门禁脚本，不上传源码发布包。
3. 在切换前用 5MB 无副作用请求验证公网代理上限，并在服务器执行两次资源门禁。
4. 拉取镜像，复制生产数据库，用新镜像迁移候选副本后检查 `/`、`/apply/`、`/projects/`、动态项目详情和 `/api/health`。
5. 备份正式数据库，将旧容器保留为 `cqai-club-portal-rollback`。
6. 迁移正式数据库并启动新容器；远端检查失败时恢复数据库和旧容器。
7. 从公网再次检查正式域名、项目接口与 5MB 代理请求。

仓库需要创建 `production` Environment，并配置：

| 类型 | 名称 | 值 |
|---|---|---|
| Repository variable | `DEPLOY_HOST` | `<服务器公网地址>` |
| Repository variable | `DEPLOY_USER` | `cqai-deploy` |
| Repository variable | `DEPLOY_PORT` | `22` |
| Repository variable | `DEPLOY_ENABLED` | 首次上线前为 `false`，验证后改为 `true` |
| Environment secret | `DEPLOY_SSH_KEY` | 专用部署私钥 |
| Environment secret | `DEPLOY_KNOWN_HOSTS` | 服务器 SSH 主机公钥记录 |
| Environment secret | `LOGTO_CLIENT_ID` | 生产 Logto“我的应用”App ID |
| Environment secret | `LOGTO_CLIENT_SECRET` | 生产 Logto“我的应用”App Secret |

部署必须使用专用的 `cqai-deploy` 账号和密钥，不复用个人 root 密钥。该账号需要 Docker 权限，以及下列目录和生产数据文件的最小读写权限：

```text
/data/cqai-club-portal/incoming
/data/cqai-club-portal/releases
/data/cqai-club-portal/backups
/data/cqai-club-portal/tmp
/data/informationCollection/.env
/data/informationCollection/prisma/dev.db
```

部署工作流会把 GitHub `production` Environment 中的两个 Logto Secret 安全同步到现有 `/data/informationCollection/.env`，并补充生产 issuer、回调地址、`club-admin` 角色和稳定的 `SESSION_SECRET`。Secret 不会进入发布包或 Git 历史。资料征集附件和项目广场封面挂载到 `/data/cqai-club-portal/storage`（分别位于 `uploads/collection` 和 `uploads/projects`），需要由 `cqai-deploy` 持有写权限。

首次上线时，先保持 `DEPLOY_ENABLED=false`，手动执行工作流并完成 Nginx 切换。确认官网、报名表、后台和健康检查均正常后，再开启自动部署。旧 Nginx 的 `/apply/` 规则会去掉路径前缀，因此不能在统一应用上线后继续保留。

## 7. 手动发布入口

手动发布也必须在 GitHub 仓库的 Actions 页面运行 `Deploy production`，由工作流生成不可变镜像、短期 GHCR 凭据和完整的远端脚本参数。当前不支持上传源码包或直接在服务器执行简化命令；这样做会绕过镜像来源、资源门禁或回滚参数校验。GitHub 暂时不可用时应暂停发布，不要直接替换生产数据库或容器。

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

仓库中的 `deploy/nginx-club.conf` 是正式配置模板。模板将请求体上限设为 6MB，为 multipart 包装预留空间；应用仍会对项目封面执行 JPG/PNG、最大 5MB 的精确校验。首次发布项目前必须由有 sudo 权限的运维人员把该上限同步到线上 Nginx；自动部署不会擅自覆盖系统 Nginx 配置。替换配置前必须备份旧文件，运行 `nginx -t` 成功后才能 reload；验证失败时恢复备份。部署前后都会发送 5MB 的未授权 multipart 探针：切换前仅接受应用的 401/404/405，切换后必须返回 401；若代理返回 413，工作流会失败且不会开始切换。正式环境应配置 HTTPS，不要直接把 Node.js 端口暴露到公网。

项目封面替换后，旧文件会在数据库备份保留期内继续保存，确保自动回滚后的旧数据库仍能读取原封面。清理无引用封面时必须晚于对应数据库备份的保留期，并先按当前数据库和备份做可达性核对。

## 9. API

### `POST /api/apply`

提交入会申请。服务端会校验必填字段、手机号、资源选项和活动选项，同一 IP 每分钟最多提交 5 次。

### `GET /auth/login`、`GET /auth/callback`、`GET /auth/logout`

后台使用 OIDC Authorization Code + PKCE 跳转 Logto 登录。登录成功后，服务端创建 HttpOnly 会话 Cookie；浏览器不保存 Logto Token。

### `GET /api/auth/me`

返回当前后台会话状态。没有会话时返回 `{ "authenticated": false }`。

### `GET /api/admin/members`

查询申请记录，需要 Logto 管理员会话。支持 `page`、`limit`、`orgType`、`city` 和 `isHighValue`；单页最多返回 100 条。

### `GET /api/admin/members/export`

导出 UTF-8 CSV，需要 Logto 管理员会话。导出内容会处理可能被 Excel 识别为公式的用户输入。

## 10. 安全与数据

- 官网、报名表和后台为同源访问，默认不开放跨域调用。
- 管理后台页面可以公开访问，但会员和资料征集 API 必须通过 Logto 管理员会话后才能调用。
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
