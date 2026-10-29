# 搜索引擎抓取与收录

公开网站的默认主域是 `https://cqaiclub.asia`。本次实现覆盖首页、项目列表与分页、项目详情、活动交流、活动详情、活动回顾和 e宝工坊。

## 页面与抓取规则

- 每个公开页面输出标题、描述、自引用 canonical、Open Graph 和 Twitter 分享信息。分页第二页及以后保留独立 canonical。
- 首页的推荐项目和近期活动在服务端直接生成 HTML 链接及简介，浏览器可复用同一份公开数据。数据源暂不可用时保留公开列表入口。
- 首页输出 Organization、WebSite 和 WebPage；公开列表、项目、活动与回顾按实际内容输出列表、面包屑、CreativeWork、Event 或 Article；e宝工坊输出 SoftwareApplication。不填造评分、价格和评价。
- `/robots.txt` 提供抓取规则及 sitemap 地址，保留公开图片 API 的抓取权限。
- `/sitemap.xml` 在运行时读取数据库，包含所有已发布且已审核的项目、未删除的公开活动，以及已结束、已发布且有正文的活动回顾。草稿、未审核项目、私有页面和重定向地址不进入站点地图。更新日期取数据库真实 `updatedAt`，不会将每次请求伪装成内容更新。
- 会员中心和预览页面通过 HTTP `X-Robots-Tag` 设置 noindex；会员页面同时输出 robots 元标签。robots 不禁止抓取这些 HTML，以便搜索引擎读取 noindex。noindex 不替代现有身份鉴权。
- `/index.html` 永久跳转到 `/`。`deploy/nginx-club.conf` 提供 HTTPS www 域名到裸域的 301 跳转。
- 首页语言切换沿用同一 URL，因此没有声明不存在的语言独立页或 hreflang。

## 部署配置

可选环境变量：

| 变量 | 用途 |
| --- | --- |
| `SITE_URL` | 网站公开根地址。优先级高于 `HOME_URL`，两者为空时使用 `https://cqaiclub.asia`；只取 origin，不带会员路径、查询或片段。 |
| `GOOGLE_SITE_VERIFICATION` | Google Search Console 的 HTML 验证码，仅填 meta 的 content 值。 |
| `BING_SITE_VERIFICATION` | Bing Webmaster Tools 的 HTML 验证码，仅填 meta 的 content 值。 |
| `BAIDU_SITE_VERIFICATION` | 百度搜索资源平台的 HTML 验证码，仅填 meta 的 content 值。 |

这些变量同时作用于静态首页响应和 Next.js 公开页面，并在运行时解析，适用于同一 Docker 镜像部署到不同域名。不要使用内部容器地址。验证代码留空时不输出相应验证标签。

应用发布后，确认以下地址返回 200，并检查它们声明的域名与生产主域一致：

1. `/robots.txt`
2. `/sitemap.xml`
3. 首页、一个公开项目、一个公开活动及一个有效回顾

如果服务器仍使用旧版 Nginx 配置，需要按现有部署流程安装更新的 `deploy/nginx-club.conf`，先执行 `nginx -t`，通过后 reload，才能启用 www 跳转。仅发布应用镜像不会自动更新宿主机 Nginx。

## 搜索平台接入

部署到生产后，用网站所有者账号在 Google Search Console、Bing Webmaster Tools、百度搜索资源平台完成站点验证并提交 `https://cqaiclub.asia/sitemap.xml`；换域名时替换为对应主域。新增内容会自动进入 sitemap，无需重新构建。

使用平台的 URL 检查、抓取诊断和索引报告确认首页及代表性详情页，持续查看发现但未索引、重复 canonical、404 和服务端错误。公开页面只有基本抓取资格，搜索引擎会自行决定是否及何时收录；后续应持续发布有实质正文的项目介绍和活动回顾，并从公开列表链接到它们。

参考：[Google 抓取与索引技术要求](https://developers.google.com/search/docs/essentials/technical)、[canonical 规则](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)、[JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)。

## 验证

```sh
npm run build
npm run test:seo
```

SEO 测试使用独立临时 SQLite 数据库和生产构建，检查无 JavaScript 时的页面元信息、公开链接、分页、结构化数据转义、404、noindex，以及 sitemap 的可见性过滤和上下架实时更新。已接入 `npm test` 和 CI。
