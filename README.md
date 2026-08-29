# 重庆 AI 创享俱乐部门户

[![CI](https://github.com/cqai-club/cqai-club-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/cqai-club/cqai-club-portal/actions/workflows/ci.yml)

重庆 AI 创享俱乐部官网及轻量会员系统，包含官网展示、公开申请表单、会员数据管理、筛选分页和 CSV 导出。

## 技术栈

- Node.js + Express
- Prisma + SQLite
- 原生 HTML/CSS/JavaScript
- Vue 3 + Tailwind CSS（CDN）

## 项目入口

- 俱乐部官网：`/`（源码：`web/index.html`）
- 入会申请：`/apply/`（源码：`public/index.html`）
- 管理后台：`/admin/`（源码：`public/admin.html`）
- 后端接口：`/api/*`

三个页面由同一个 Express 服务提供，不需要分别启动或配置跨域。

服务器原来的 `/var/www/club` 是 `web/` 的旧部署副本。新版本会把 `web/` 直接打包进统一应用镜像，旧目录只保留用于紧急回滚，不再作为正式站点单独发布。

## 本地运行

要求 Node.js 20 或更高版本。

```bash
npm ci
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm start
```

启动后访问：

- 俱乐部官网：`http://localhost:3000/`
- 入会申请：`http://localhost:3000/apply/`
- 管理后台：`http://localhost:3000/admin/`
- 健康检查：`http://localhost:3000/health`

首次运行前，请在 `.env` 中设置长随机管理员密码：

```dotenv
ADMIN_USERNAME="your-admin-name"
ADMIN_PASSWORD="your-long-random-password"
```

## 数据与隐私

会员数据库包含姓名、手机号、微信、邮箱、单位和合作意向等个人信息。仓库已经忽略以下本地文件，禁止将它们提交到 Git：

- `.env`
- `prisma/*.db`
- `node_modules/`

公开部署前请使用 HTTPS、设置新的管理员密码，并妥善备份及保护数据库。

更多部署说明参见 [DEPLOYMENT_MANUAL.md](./DEPLOYMENT_MANUAL.md)。

## 自动化检查

推送到 `main` 或创建 Pull Request 时，GitHub Actions 会自动安装依赖，检查官网资源与三个页面入口，并使用独立的临时 SQLite 数据库检查参数校验、管理员登录、申请提交、会员查询和 CSV 导出。也可以在本地运行：

```bash
npm test
```

## 自动部署

生产环境通过 [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) 发布到 `cqaiclub.asia`。CI 成功后，工作流会把同一个已测试提交上传到服务器，构建 Docker 镜像，使用生产数据库副本验证候选版本，再备份正式 SQLite 数据并切换容器。

自动发布默认由仓库变量 `DEPLOY_ENABLED` 控制。首次部署和 Nginx 切换验证完成前应保持为 `false`；之后设为 `true`，每次 `main` 分支 CI 成功后自动发布。服务器账号、GitHub 变量和密钥配置见 [DEPLOYMENT_MANUAL.md](./DEPLOYMENT_MANUAL.md)。
