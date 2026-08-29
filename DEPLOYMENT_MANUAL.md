# 重庆AI创享俱乐部 - 入会申请系统 (全栈部署操作手册)

本手册由系统全栈架构师撰写，旨在为您后期的服务器部署、系统维护与二次开发提供一站式的参考指南。

---

## 1. 业务架构概览 (Architecture)
本项目采用 **“前后端一体化单体架构 (Monolith)”**，去除了繁琐的现代前端脚手架编译环节，最大化了运行的稳定性和部署便捷性。

- **C端展示层**：原生 HTML5 + Vanilla JS 原生驱动 (`server/public/index.html`)。无编译，极速渲染。
- **B端管理层**：由 Vue 3 (CDN引入) + TailwindCSS (CDN) 构建的响应式数据看板 (`server/public/admin.html`)。
- **后端服务层**：Node.js 运行时 + Express.js 引擎。内置 CORS 跨域许可、Rate-Limit 恶意防刷限制、XSS 参数过滤机制。
- **数据持久层**：Prisma ORM。目前默认搭载零活力的 `SQLite` (本地开发优先)，能够无缝一键切换并映射至生产级的 `PostgreSQL` 或 `MySQL` 关系型数据库管理系统。

---

## 2. 开发进度说明 (Progress)

| 阶段 / 核心模块 | 状态 | 详情与功能支撑 |
|---|---|---|
| **数据库建模** | ✅ 已完成 | 映射涵盖 4 大问卷版块、多选复杂表单采用 JSON 特殊处理，外置 VIP 高亮标签引擎。|
| **后端核心 API** | ✅ 已完成 | 高并发防刷限流、请求安全过滤、表单写入、管理员分页检索及原生动态 CSV 导出系统全系打通。 |
| **C端原型重构** | ✅ 已完成 | C 端纯静态原型的 Fetch 重构已完成；自定义错误弹窗追踪及滑动动画体验调优已合并到位。 |
| **B端后台体系** | ✅ 已完成 | 搭建了全响应式的单页运营应用，囊括：硬编码鉴权（后期可扩展JWT）、高亮显示及极速响应查询。 |

---

## 3. 服务器部署流程 (Deployment Guide)

以下是将此项目部署到线上 Linux (CentOS/Ubuntu) 云服务器的推荐的标准流程。

**系统环境依赖：**
如果您是首台新服，请先在服务器上安装好 **Node.js** (版本 >= 18.0) 以及 **npm**。建议全局安装守护进程管理器 `pm2`：`npm install -g pm2`。

### 步骤 1：上传项目
将本电脑整个 `server/` 文件夹上传到服务器的期望管理目录下（例如 `/home/www/aiclub_form_server` ）。
注意不需要上传原来的旧 HTML 以及本机器里巨大的 `node_modules` 文件夹。

### 步骤 2：环境装配
进入上传的服务器目录，运行以下指令恢复所有包环境。
```bash
cd /home/www/aiclub_form_server
npm install
```

### 步骤 3：数据库建设与对齐
如果您继续使用极其轻量的自带 `SQLite`，只需执行下述命令完成本地库文件的生成即可：
```bash
npx prisma generate
npx prisma db push
```
*(如果线上使用真实的云库 PostgreSQL，请参阅下方【高级配置】改变驱动并在 `.env` 里更换链接地址。)*

### 步骤 4：守护进程启动
不要直接用 `node index.js`（退出终端会断开），采用 `pm2` 使其 24 小时后台存活开机自启：
```bash
pm2 start index.js --name "CQ_AI_Club"
pm2 save
```
完成！您现在就可以用云服务器的外网 IP 进行端口 (默认3000) 访问并分享系统了。

---

## 4. 环境变量与安全密钥 (.env 配置)

生产部署前，建议检查修改 `server/.env` 文件。

| 环境变量参数 | 示例值 | 参数释义 |
|---|---|---|
| **DATABASE_URL** | `"file:./dev.db"` | 数据库核心链接串。使用 Postgres 时，请从云数据库控制台复制连接串并仅写入服务器的 `.env`。 |
| **PORT** (需加参) | `3000` | 后端 Express 服务器对外监听的 HTTP 端口号，如果您希望通过 80 端口直接开放，将其设为 80 或者配置 Nginx 代理。 |
| **ADMIN_USERNAME** | `change-me` | 管理后台账号。请勿使用示例值。 |
| **ADMIN_PASSWORD** | `use-a-long-random-password` | 管理后台密码。请使用长随机密码，且不要提交 `.env`。 |

> **高级配置说明 (Postgres 切换法):**
如果决定线上切换为大型关系库：打开 `server/prisma/schema.prisma` 文件，将 `provider = "sqlite"` 改为 `provider = "postgresql"`。然后在控制台重新运行一次 `npx prisma db push` 即可，ORM 引擎会替您抹平所有底层 SQL 语法的迁移工作。

---

## 5. API 接口文档 (API Reference)

前端开发或外部系统集成需要的重要交互口令：

### 1. `POST /api/apply` 提交申请 (C端)
- **Content-Type**: `application/json`
- **防刷机制**: 同一IP每分钟限5次交互。超出返回 `HTTP 429`。
- **重复校验**: 支持对唯一的 `phone` 下发 `HTTP 400` ("该手机号码已提交过申请")。

### 2. `GET /api/admin/members` 查询列表 (B端)
- 权限机制：先通过 `POST /api/admin/login` 登录，再使用返回的临时 Bearer Token 访问管理接口。
- Query 查询参数支持：
  - `page`: 当前分页页码 (默认 1)
  - `limit`: 单页条数 (默认 10)
  - `isHighValue`: 是否仅查询系统拦截判定的 "高价值VIP客户" (传入 `true` 则过滤)
  - `orgType`: 按单位性质精准匹配 (如：`民营企业`)
  - `city`: 结合前后模糊 LIKE 查询的动态城市检索。

### 3. `GET /api/admin/members/export` 下发业务包 (B端)
- 功能：导出全量名单 CSV (采用 Excel GBK 格式防止中文系统下的乱码)。
- 响应：返回文件流格式自动下载 `members_export_时间戳.csv`。

---
`*该手册为内部留存指导文件。在项目后续流转给任意后端或前端团队时，凭本手册与项目包即可无缝过渡接手二次开发工作。`
