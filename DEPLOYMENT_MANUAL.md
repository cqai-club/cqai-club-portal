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
- 生产环境建议使用 Nginx 和进程守护工具，例如 PM2 或 systemd

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

## 5. Linux 服务器部署

```bash
git clone https://github.com/cqai-club/cqai-club-portal.git
cd cqai-club-portal
npm ci
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
```

编辑 `.env` 后启动：

```bash
pm2 start index.js --name cqai-club-portal
pm2 save
```

更新版本时：

```bash
git pull --ff-only
npm ci
npx prisma generate
npx prisma migrate deploy
pm2 restart cqai-club-portal
```

更新前应先备份生产数据库。

## 6. Nginx 反向代理示例

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

正式环境应配置 HTTPS。不要直接把 Node.js 端口暴露到公网。

## 7. API

### `POST /api/apply`

提交入会申请。服务端会校验必填字段、手机号、资源选项和活动选项，同一 IP 每分钟最多提交 5 次。

### `POST /api/admin/login`

使用 `.env` 中的管理员账号登录，成功后返回有效期 8 小时的临时 Bearer Token。服务重启后需要重新登录。

### `GET /api/admin/members`

查询申请记录，需要 Bearer Token。支持 `page`、`limit`、`orgType`、`city` 和 `isHighValue`；单页最多返回 100 条。

### `GET /api/admin/members/export`

导出 UTF-8 CSV，需要 Bearer Token。导出内容会处理可能被 Excel 识别为公式的用户输入。

## 8. 安全与数据

- 官网、报名表和后台为同源访问，默认不开放跨域调用。
- 管理后台页面可以公开访问，但会员 API 必须登录后才能调用。
- SQLite 数据包含姓名、手机号、微信、邮箱和单位等个人信息，应限制文件权限并定期备份。
- 不要把 `.env`、数据库备份、服务器日志或导出的会员 CSV 上传到 GitHub。
- 如需迁移到 PostgreSQL/MySQL，必须重新设计 Prisma datasource 和迁移文件，不能只替换连接地址。

## 9. 自动检查

每次推送到 `main` 或创建 Pull Request 时，GitHub Actions 会运行：

```bash
npm ci
npm test
```

测试使用独立的临时 SQLite 数据库，不读取或修改本地及生产会员数据。
