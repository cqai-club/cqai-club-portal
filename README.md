# 重庆 AI 创享俱乐部门户

[![CI](https://github.com/cqai-club/cqai-club-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/cqai-club/cqai-club-portal/actions/workflows/ci.yml)

一个轻量的入会申请与会员管理系统，包含公开申请表单、会员数据管理、筛选分页和 CSV 导出。

## 技术栈

- Node.js + Express
- Prisma + SQLite
- 原生 HTML/CSS/JavaScript
- Vue 3 + Tailwind CSS（CDN）

## 本地运行

要求 Node.js 18 或更高版本。

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma db push
npm start
```

启动后访问：

- 入会申请：`http://localhost:3000/`
- 管理后台：`http://localhost:3000/admin.html`

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

推送到 `main` 或创建 Pull Request 时，GitHub Actions 会自动安装依赖，并使用独立的临时 SQLite 数据库检查公开页面、管理员登录、申请提交、会员查询和 CSV 导出。也可以在本地运行：

```bash
npm test
```
