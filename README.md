# 重庆 AI 创享俱乐部门户

[![CI](https://github.com/cqai-club/cqai-club-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/cqai-club/cqai-club-portal/actions/workflows/ci.yml)
[![Deploy](https://github.com/cqai-club/cqai-club-portal/actions/workflows/deploy.yml/badge.svg)](https://github.com/cqai-club/cqai-club-portal/actions/workflows/deploy.yml)

重庆 AI 创享俱乐部的一体化门户，包含俱乐部官网、入会申请和会员管理后台，由同一个 Node.js 服务统一提供。

线上地址：[https://cqaiclub.asia](https://cqaiclub.asia)

## 功能入口

| 模块 | 访问路径 | 主要功能 |
|---|---|---|
| 俱乐部官网 | `/` | 俱乐部介绍、活动体系、项目展示和入会入口 |
| 入会申请 | `/apply/` | 收集申请信息、校验必填项并识别重点会员 |
| 管理后台 | `/admin/` | 登录、分页查询、条件筛选和 CSV 导出 |
| 后端接口 | `/api/*` | 申请提交、管理员认证和会员数据管理 |
| 健康检查 | `/health` | 返回当前服务运行状态 |

## 技术栈

- Node.js 20 + Express
- Prisma + SQLite
- 原生 HTML、CSS、JavaScript
- Vue 3 + Tailwind CSS（管理后台 CDN 引入）
- Docker + Nginx
- GitHub Actions 持续集成与自动部署

## 项目结构

```text
.
├── web/                    # 俱乐部官网和品牌图片
├── public/                 # 入会申请与管理后台
├── prisma/                 # 数据模型和数据库迁移
├── scripts/                # 自动化测试
├── deploy/                 # 服务器部署与 Nginx 配置
├── .github/workflows/      # CI 和生产部署工作流
├── index.js                # Express 服务入口
└── Dockerfile              # 生产镜像
```

## 本地运行

要求 Node.js 20 或更高版本。

```bash
npm ci
cp .env.example .env
npx prisma migrate deploy
npm start
```

启动后访问：

- 官网：`http://localhost:3000/`
- 入会申请：`http://localhost:3000/apply/`
- 管理后台：`http://localhost:3000/admin/`
- 健康检查：`http://localhost:3000/health`

## 环境变量

```dotenv
DATABASE_URL="file:./dev.db"
PORT=3000
ADMIN_USERNAME="change-me"
ADMIN_PASSWORD="use-a-long-random-password"
```

生产环境必须使用独立管理员账号和长随机密码，不要把真实配置写入仓库。

## 自动化测试

```bash
npm test
```

测试会创建独立的临时 SQLite 数据库，检查官网资源、favicon、报名页、管理后台、登录认证、申请提交、会员查询和 CSV 导出，不会读取本地或生产会员数据。

## 自动部署

推送到 `main` 后，GitHub Actions 会先运行 CI。测试通过后，生产工作流会：

1. 构建带提交版本的 Docker 镜像。
2. 使用生产数据库副本验证迁移和页面入口。
3. 备份正式 SQLite 数据库。
4. 切换应用容器并保留上一版本用于回滚。
5. 从公网验证官网、报名页、后台和健康检查。

完整服务器配置和回滚说明见 [DEPLOYMENT_MANUAL.md](./DEPLOYMENT_MANUAL.md)。

## 数据与隐私

会员数据库包含姓名、手机号、微信、邮箱、单位和合作意向等个人信息。以下内容禁止提交到 Git：

- `.env` 和其他真实环境配置
- `prisma/*.db`、SQLite 日志和数据库备份
- 管理后台导出的会员 CSV
- 服务器日志、部署私钥和管理员凭据

生产站点使用 HTTPS，数据库与环境文件由服务器专用部署账号按最小权限访问。
