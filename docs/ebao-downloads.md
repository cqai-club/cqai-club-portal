# e宝工坊下载分流

下载按钮访问 `/api/ebao-studio/download?platform=windows` 或 `platform=macos`。接口使用本地 IPv4/IPv6 国家数据库识别访问 IP：中国大陆（CN）走 `g-dxw/ebao-studio` 的 GitCode，其他地区走 `cqai-club/ebao-studio` 的 GitHub。没有可识别公网 IP 时默认 GitHub；不依据浏览器语言或时区判断。识别的是网络出口，使用代理时可在下载卡片手动选择源（`source=gitcode` 或 `source=github`）。

应用延续现有门户的可信代理约定：先读取由 `deploy/nginx-club.conf` 覆盖的 `X-Real-IP`，没有该字段才读取 `X-Forwarded-For` 的最后一个地址。生产应用必须保持仅可信反向代理可访问。如果未来在 Nginx 前增加 CDN，需要先配置真实客户端 IP 还原；不能直接把 CDN 节点 IP 当作用户 IP。

每次点击都会以 `cache: no-store` 查询对应平台最近 100 个公开 Release，优先按语义版本号选择具有对应安装包的最高版本，包含当前测试预发布。补传旧版本不会覆盖新版本；同版本以发布时间排序，无法解析版本号的条目排在标准版本之后并按发布时间（GitCode 使用创建时间）排序。GitHub 的 `/releases/latest` 会跳过预发布，不能用于当前版本。Windows 下载 x64 Setup EXE，macOS 下载 Universal DMG；便携 ZIP 和历史版本保留在发行页面入口。国内外下载源各自获取最新可用版本，GitCode 镜像尚未同步时可能暂时落后于 GitHub。

只接受对应仓库 HTTPS `/releases/download/` 路径的永久附件地址，不缓存临时 CDN 签名 URL。应用返回 `302` 和 `Cache-Control: private, no-store`，安装包由平台 CDN 提供。API 限流、超过 5 秒或没有有效安装包时跳转到同一下载源的发行列表。

GitCode 可匿名查询。GitHub 可匿名查询，但额度按服务器出口 IP 共享；访问量增加时可在服务器设置只读 `EBAO_RELEASE_GITHUB_TOKEN` 提高额度。令牌仅在服务端发往 GitHub，未配置时不影响启动。

`geoip-country` 携带国家数据库，不在访问时请求外部定位服务。当前依赖固定数据库快照，后续维护时应更新此依赖并验证 IPv4/IPv6 样本；数据库不会在服务启动时自动下载。Next standalone tracing 显式包含数据库文件。

国家数据库包含 [MaxMind](https://www.maxmind.com/) 创建的 GeoLite2 数据，使用条款见依赖附带的 LICENSE 和 EULA；国家数据按 CC BY-SA 4.0 提供。

验证：`npm run test:ebao-downloads`、类型检查、构建，以及 standalone 中真实请求自动/手动选择两种下载源。下载接口测试应检查门户的 302 响应；GitCode 的附件 GET 可匿名跳转，但 HEAD 可能返回 401，不以 HEAD 判断下载失效。
