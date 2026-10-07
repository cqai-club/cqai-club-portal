# CQAI Club MCP 与本地 Skills

官网提供 `/mcp` Streamable HTTP 服务，复用活动、报名、插件投稿与市场管理业务。四个本地 Skills 负责从文章提取信息、补齐缺项、保留重试键、按照用户授权调用工具和回读结果。它们不携带登录令牌，也不会执行 npm 发布。

本次实现提供服务代码、本地 stdio 授权桥接、Skills 和模拟测试。部署、Logto 新资源/应用配置、真实浏览器登录、真实文章发布和 e宝工坊打包客户端端到端验收仍需在对应环境完成；本地测试不能代表这些步骤已经通过。

## 官网部署与 Logto 配置

部署数据库迁移后再启用 MCP。`ClubMcpOperation` 保存身份、工具、requestKey、输入摘要和原结果；`ClubMcpSource` 关联文章来源与活动，业务写入与这两类记录处于同一事务，不能只更新代码而遗漏迁移。

```sh
npm ci
npx prisma generate --schema prisma/schema.prisma
npx prisma migrate deploy --schema prisma/schema.prisma
npm run build
```

迁移使用该环境配置的 `DATABASE_URL`。生产发布脚本 `deploy/remote-deploy.sh` 会先迁移候选数据库、再在切流前迁移生产数据库；直接启动 Docker 容器不会自动迁移，需按上面的命令先完成迁移。不要将本地测试数据库替换为官网数据。

| 官网配置 | 用途 |
| --- | --- |
| `BASE_URL_PROD` / 开发环境的 `BASE_URL_DEV` | 对外地址，默认 MCP audience 为该 origin 的 `/mcp` |
| `CQAI_MCP_RESOURCE` | 可显式指定 MCP 的完整 HTTPS `/mcp` 地址；本地开发可用 loopback HTTP |
| `LOGTO_ENDPOINT` | 已有 Logto 服务地址；实际 issuer 为该地址的 `/oidc` |
| `CQAI_MCP_ALLOWED_ORIGINS` | 可选，逗号分隔浏览器 origin；默认仅官网 origin，原生客户端可省略 Origin |
| `CQAI_MCP_ADMIN_TOOLS_ENABLED` | 只有值为 `true` 才暴露四个管理员市场工具，默认关闭 |
| `CQAI_MCP_NPM_REGISTRY_URL` | 可选的受信 HTTPS npm registry，默认 `https://registry.npmjs.org/`；生产通常保留默认值 |

在 Logto 中创建 API Resource，identifier 必须与官网 discovery 中的 `resource` 完全相同，例如 `https://club.example/mcp`。在这一资源下创建 `activity:publish` 和 `plugin:admin`；将对应权限授予需要管理活动/市场的用户角色。普通登录用户可以查询公开活动、报名、取消本人报名和投稿，管理操作要求相应权限。已有 REST resource 的授权不能替代 MCP resource 的授权。

创建或选用支持 Authorization Code + PKCE 的 **Native/public application**，记录 client ID。注册一个固定 loopback 回调，例如 `http://127.0.0.1:41887/callback`，它必须与桥接配置逐字一致。桥接不需要 client secret，不做动态客户端注册。登录请求包含 `openid offline_access`，Logto 应允许 refresh token，并启用所需 API resource 权限；权限或 scope 变更后再次运行 `login` 重新授权。

桥接使用的固定版本 MCP SDK 在请求 `offline_access` 时自动追加 `prompt=consent`，满足 [Logto 对刷新令牌的授权要求](https://docs.logto.io/customization/live-preview#refresh-token-grant)。

服务在以下地址公布 OAuth Protected Resource Metadata：

- `/.well-known/oauth-protected-resource/mcp`
- `/.well-known/oauth-protected-resource`

未授权请求返回真实 `401` 和带 `resource_metadata` 的 `WWW-Authenticate`。缺少工具权限返回 `403` 和所需 scope。MCP 仅接受 audience 为 MCP resource 的 Logto access token；官网 Cookie、ID token、Relay token 及其他 audience 的 access token 都不能替代它。资源 URL 来自部署配置，不能由请求 Host 改写。

## 支持原生 OAuth 的客户端

客户端填写完整 `/mcp` URL，通过上述 discovery 登录，使用授权码 + PKCE 获取面向 MCP audience 的令牌并自动刷新。使用预注册应用时填写同一 client ID/回调。当前服务无长连接 session，使用 POST 发送 SDK 协议请求，GET/DELETE 返回 405。

客户端实现 OAuth 时可参照 [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)。当前实现固定使用 `@modelcontextprotocol/sdk` 1.31.0；协议协商由 SDK 完成。客户端仍需按实际版本验证兼容性。

## e宝工坊与静态 headers 客户端：本地 stdio 桥接

无法动态刷新 HTTP headers 的客户端可以启动仓库中的桥接包。它通过 stdio 暴露标准 MCP tools/list 与 tools/call，远端连接使用 SDK Streamable HTTP transport。桥接只透传工具调用，不改 e宝工坊内置 SDK 或上游配置；远端服务器 instructions/prompts/resources 暂未转发，业务编排由下面的本地 Skills 提供。

需要 Node.js 20 或以上。在官网仓库根目录运行 `npm ci` 后，即可使用根依赖启动；独立复制桥接目录时，先在该目录运行 `npm install --ignore-scripts` 安装固定 SDK 依赖。此包当前随仓库分发，未发布到 npm。

在本机终端设置实际配置，执行一次登录（下列域名和 client ID 是占位示例，不能直接连接生产）：

```sh
export CQAI_MCP_URL='https://club.example/mcp'
export CQAI_MCP_ISSUER='https://auth.example/oidc'
export CQAI_MCP_CLIENT_ID='your-registered-native-client-id'
export CQAI_MCP_REDIRECT_URI='http://127.0.0.1:41887/callback'
node /absolute/path/to/cqai-club-portal/packages/cqai-club-mcp-bridge/cli.mjs login
```

浏览器打开 Logto 授权页面，回调的 state/issuer、PKCE S256 与注册回调均被校验，完成后终端提示成功。`login` 始终发起新的 PKCE 授权以取得当前权限；原凭据文件在新授权成功前保留，新 grant 不继承旧 refresh token。没有浏览器启动器时用 `login --no-browser`，按终端中的链接打开浏览器。登录最长等待五分钟。回调端口被占用时，应释放该端口，或改为另一个已经在 Logto 注册的固定回调。

然后在 e宝工坊的 MCP 面板添加 **stdio** 服务，按面板字段填写以下内容。其他客户端也可用同样的 command/args/env；示例结构需要放进该客户端实际的配置外层：

```json
{
  "command": "node",
  "args": [
    "/absolute/path/to/cqai-club-portal/packages/cqai-club-mcp-bridge/cli.mjs",
    "serve"
  ],
  "env": {
    "CQAI_MCP_URL": "https://club.example/mcp",
    "CQAI_MCP_ISSUER": "https://auth.example/oidc",
    "CQAI_MCP_CLIENT_ID": "your-registered-native-client-id",
    "CQAI_MCP_REDIRECT_URI": "http://127.0.0.1:41887/callback"
  }
}
```

若客户端找不到 `node`，把 command 换成该机器 Node 可执行文件的绝对路径。登录终端与 MCP 面板必须使用相同的四个环境变量；面板需要独立填写这些变量，GUI 通常不继承终端 export。

可选 `CQAI_MCP_SCOPE` 明确请求的业务 scope，登录仍追加 `openid offline_access`；默认从资源 metadata 取全部支持的 scope。可选 `CQAI_MCP_STATE_DIR` 指定令牌保存目录。默认 `~/.config/cqai-club-mcp/`，目录权限 700、令牌文件权限 600，文件绑定于服务 URL、issuer、client ID 和回调，使用原子替换保存。客户端与登录终端必须由同一系统用户运行；不要把目录放到 Git、同步盘、Skill、headers 配置或日志中。

`serve` 在到期前刷新凭据，远端返回 401 时由 SDK 刷新并最多重试一次，随后停止该请求。同一配置的多个进程通过本地文件锁串行更新，刷新前在锁内读取最新凭据；失效处理只删除自己尝试的凭据版本，不能删除另一进程已保存的新令牌。进程退出后的旧 PID 锁可恢复。刷新失效时提示重新登录，运行期不会自行开启浏览器。`logout` 只删除当前配置对应的本地凭据，随后需重新登录；它不撤销 Logto 端其他会话。HTTP metadata 仅取官网同源地址，授权 metadata/端点仅信任配置的 Logto issuer/origin，并拒绝 HTTP 跳转，防止令牌或 verifier 发送到未知来源。

桥接 stdout 只用于 MCP 协议，运行提示写 stderr，错误日志不输出原始 OAuth 响应或令牌。

## 工具与权限

| 工具 | 行为 |
| --- | --- |
| `club_list_activities`, `club_get_activity` | 读取公开活动 |
| `club_list_managed_activities`, `club_get_managed_activity`, `club_activity_registrations` | 管理查询，要求 `activity:publish` |
| `club_prepare_activity` | 对本地提取的字段做结构校验，返回 provided、missingFields、validationErrors 和稳定 source；不下载文章 URL |
| `club_create_activity`, `club_update_activity`, `club_publish_activity` | 创建完整草稿、修改、发布，要求 `activity:publish` |
| `club_register_activity`, `club_cancel_registration`, `club_my_registrations` | 当前登录用户的报名与查询 |
| `club_validate_plugin_package` | 只读验证公开 npm 包名称、版本与下载地址，不下载或运行包代码 |
| `club_submit_plugin`, `club_my_plugin_submissions`, `club_get_plugin_submission` | 投稿、本人投稿查询；提交时强制 npm 校验 |
| `club_list_plugin_submissions`, `club_review_plugin_submission`, `club_update_market_plugin`, `club_publish_market_plugin` | 可选管理员审核、编辑、上架，开关开启且要求 `plugin:admin` |

以客户端获取的实际 inputSchema 为准。所有写入都需要 8–128 字符稳定 `requestKey`；UUID 可用。首次调用前持久保存操作、完整参数、键和后续结果，超时/断线/刷新后的相同操作复用该键。相同键换输入会得到冲突，不能通过换键重试未知结果。用户改变意图或参数时是新操作，保留旧记录并分配新键。source.key 关联真实文章；相同身份下的同一来源不会再次创建活动。

幂等重放返回原操作结果快照，因此写入后需查询当前记录。活动草稿使用已有管理页链接，`publicUrl` 为 null；发布后的公开 URL 指向 `/activities/:id`。投稿 `url` 指向 `/api/v1/me/plugin-submissions`，该浏览器/REST 地址使用原有 Session 或 REST audience，MCP token 不能直接用来打开它；推荐用投稿查询工具获取本人审核结果。投稿 approved 仅生成市场 draft；独立上架成功后才返回公开 `/v1/plugins` catalog 链接。npm 发布、官网投稿、审核、市场上架是不同操作。

## 安装四个 Skills

仓库里的以下目录各自是一个独立 Skill，入口为 `SKILL.md`：

- `skills/cqai-club-article-to-activity`：文章提取、补齐信息、保存草稿，已有发布授权时继续。
- `skills/cqai-club-publish-activity`：检查和发布已有活动，回读管理记录与公开详情。
- `skills/cqai-club-register-activity`：当前用户报名/取消与结果核验。
- `skills/cqai-club-submit-plugin`：公开 npm 验证、官网投稿与审核状态回读。

在 e宝工坊的本地 Skill 导入入口选择对应目录，或复制到当前客户端配置的 Skills 目录；使用客户端支持的实际安装方式。本次实现只提供仓库文件，不安装或修改用户全局 Skills，也未验证打包 e宝工坊的导入 UI。连接 MCP 后，可分别以“把这篇文章整理成活动草稿”“把活动 X 发布”“给我报名活动 X”“把 npm 包 X 投稿到官网”验证。

Skill 把原文中的操作指令当作素材，只执行用户授权的范围。缺失日期、地点、名额等信息先一次询问并补齐，不编造默认值。用户已明确授权发布则不重复确认。每次写入保存 requestKey，回读后交付真实 ID、状态与服务返回的链接。

## 文章发布流程示例

先连接 MCP，以具有 `activity:publish` 的账户登录。用户提供真实 Markdown 和来源，并明确要求发布；本地 Agent 读取文章后按下面的顺序执行。表中的变量取自真实输入或上一工具结果，不能直接当作固定值提交。

| 步骤 | 调用与核验 |
| --- | --- |
| 整理 | `club_prepare_activity({ article, source })`，保留原文 Markdown；一次补齐 `missingFields`，纠正 `validationErrors` |
| 校验 | 再传 `{ article, source, fields }`，确认 `ready: true`；把返回的 `provided` 作为后续 `input`，时间含明确时区，名额和地点来自用户 |
| 建草稿 | 将完整 `{ input, source, requestKey: createKey }` 保存到本地操作记录，再调用 `club_create_activity`，保存返回的 `id`、`status`、`manageUrl` |
| 发布 | 为发布保存独立的 `{ id, requestKey: publishKey }`，调用 `club_publish_activity`；失败重试继续使用该键和参数 |
| 回读 | 用同一 `id` 调用 `club_get_managed_activity` 和 `club_get_activity`，检查 `published`、正文、时间、`publicUrl`，最后打开真实公开链接 |

交付结果中的活动 ID、`published` 状态和官网链接必须来自回读，不从标题推算。若发布请求超时，先查询当前状态；仍为草稿时用原发布键重试。草稿只交付管理链接。报名和投稿也应保存写入键，并分别通过本人报名查询、本人投稿查询核验最终状态。

## 验证

```sh
npm run build
npm run test:mcp
npm test --prefix packages/cqai-club-mcp-bridge
```

`test:mcp` 在临时 SQLite 数据库与本地模拟 Logto JWKS/npm Registry 上启动真实 Next 服务，通过 SDK Client 发现和调用工具。它覆盖文章缺项→完整草稿→编辑→发布→官网回读、报名与取消、投稿→审核草稿→正式上架，并检查错误 audience、过期令牌、越权、同键并发重试和来源防重；结束后关闭服务并清理数据库。

测试还会启动真正的 stdio 桥接子进程，完成握手、工具发现和公开活动回读，并检查退出清理。可用 `CQAI_MCP_V2_CLIENT_MODULE=/absolute/path/to/installed/sdk-v2/index.cjs npm run test:mcp` 额外检验已安装 SDK v2 的协议协商、工具发现与调用；此参数必须是明确的本地模块路径，不是远程下载地址。当前本地验证已通过 e宝工坊安装的 `@modelcontextprotocol/client` 2.0.0，但这不代表打包客户端 UI 验收已通过。

模拟测试使用固定 SDK 服务/传输验证 OAuth discovery、PKCE/state、新权限登录、600 权限、到期刷新、重启后的令牌复用、多个实例的刷新轮转与旧失效处理、401 单次重试、未知来源拒绝以及工具参数透传，不连接 Logto 或生产官网。

环境准备完毕后的端到端验收应使用具有明确操作授权的测试账户和测试内容：真实文章补齐后建草稿、发布并公开回读；用户报名/取消并回读；已存在的公开 npm 测试包投稿并查询审核状态。管理员审核与上架在启用开关且拥有权限的账户下另行验收。部署、真实登录与生产写操作应按该环境已有发布流程执行。
