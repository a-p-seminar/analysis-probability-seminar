# 分析与概率讨论班

武汉大学 · 华中师范大学的分析与概率讨论班档案。前台展示完整报告，后台编辑资料并把讲义存入这个 GitHub 仓库。当前部署在 Netlify，前后端在同一域名下运行。

Netlify 线上地址：[讲座档案](https://s-ap.netlify.app/) · [管理后台](https://s-ap.netlify.app/admin.html)。Cloudflare Worker 与 Render 新建服务已按要求移除。已重新验证 91 场报告和 30 份 PDF，公开资料与 GitHub 一致，后台登录及 PDF 访问正常。

**历史资料已完整迁移：两个原始网站有 56 场和 35 场报告，去掉 2 场重复后共有 89 场历史报告。** 当前档案还包括后台新增的杨博寒报告及此次补录的 Mumtaz Hussain 报告；已删除测试报告，共 91 场正式报告、30 份 PDF，覆盖 2023—2026 年。此后可继续通过后台更新。

原始资料来自 [讨论班原始主页](https://perso.math.u-pem.fr/liao.lingmin/SAP-WH.html) 和 [学术档案仓库](https://github.com/a-p-seminar/Seminar-of-Analysis-and-Probability)。逐条来源、去重依据、附件改名和文件指纹见 [迁移核对说明](sources/import-summary.md) 与 [完整核对清单](sources/import-report.json)。原来源中有 5 份附件已失效，4 场摘要未能确认，均保留记录并注明，未生成替代内容。讲座摘要和讲义的权利归原作者所有。

## 可以做什么

- 展示全部符合筛选条件的报告，按北京时间的结束时间区分“即将举行 (forthcoming)”和“已经举行 (past)”，两个分界标题采用相同的加粗斜体样式，每个区段按 `YYYY-MM` 分组；悬浮筛选栏提供年份、月份下拉选择和关键词搜索。
- 每条报告使用独立卡片，按题目、报告人及单位、日期时间地点的顺序展示；摘要默认收起，点击后展开完整内容。点击青蓝色标题会在新窗口打开该报告的会议链接，摘要和附件独立操作。
- 页首展示中英文标题和科赫雪花曲线内的 a · p 标志；点击分形图在新窗口打开管理页面。组织者及轮流举办说明在桌面直接显示，手机和 iPad 通过右下角“关于”按钮展开。前台隐藏导入备注和原始记录链接，来源信息仍保留在数据中。
- 单份 PDF 入口显示为“PDF”，同一报告的多份 PDF 按顺序显示为“PDF I”“PDF II”等；PDF 有独立阅读器、缩略图、缩放、下载和打印。PPT/PPTX 保留原文件下载。
- `/admin.html` 提供密码登录、新增、编辑、删除、链接和附件上传；单位合并为一个可选输入框，多个单位和中英文名称用 `/` 分隔，如 `克里特大学/Crete University`。编辑表单不再显示补充说明。没有附件的报告也可以正常发布。
- 后台与前台采用相同的白底蓝色风格，可组合筛选年份、月份、起止日期和关键词；筛选不影响正在编辑的草稿。地点由“武大／华师”学校选项和具体地点组成，公开页面显示为“武大 · …”或“华师 · …”；没有具体地点时隐藏学校与地点标识。
- 单个附件上限 50 MiB，分片上传并显示进度，服务器验证扩展名和文件头；自动命名为 `YYMMDD_报告人_报告名第一个单词_附件ID.ext`，保留正常空格，替换系统不允许的字符。
- 内容和附件通过 GitHub API 更新，前台运行时获取最新资料，无需重新部署。
- 同时编辑时检查版本，防止较旧的页面覆盖他人的更新。

PPT/PPTX 不会自动转 PDF。如果希望访客像浏览器中的 PDF 一样阅读，可以在 WPS 或 PowerPoint 中导出 PDF 后上传；同一报告也可以同时保留 PDF 和 PPTX。

## 本地运行

需要 Node.js 22.13 或更新版本，以及 pnpm。

```sh
pnpm install
pnpm setup:admin
pnpm dev
```

前台地址是 `http://127.0.0.1:5173/`，后台是 `http://127.0.0.1:5173/admin.html`。

首次 `pnpm setup:admin` 会生成强密码和会话密钥。密码放在 `.local-data/admin-login.txt`，密码的 scrypt 哈希和密钥放在 `.env.local`。两个文件均不会提交到 GitHub；重复运行该命令不会覆盖已有配置。

本地运行使用本机 `content/seminars.json` 和 `attachments/`。本地保存不会自动同步到 GitHub。日常改密请使用后台导航栏的“修改密码”，不需要修改环境变量。

### 后台修改密码

登录后点击“修改密码”，输入当前密码、新密码及确认新密码。新密码没有字符数限制，不能为空或全为空格；有未保存的报告时须先保存。修改成功后，包括当前页面在内的所有旧会话失效，需要使用新密码重新登录。

**Netlify 线上密码保存在 `ADMIN_PASSWORD` 环境变量中，值为明文。** 此变量使用 Production 上下文，范围须包含 Functions，不勾选 “Contains secret values”，以便你查看或直接修改。后台“修改密码”通过 Netlify API 同步更新这个变量；认证实时读取 API 中的最新值，不依赖部署时的环境快照。因此，忘记密码时在 Netlify 修改该变量后即可重新登录，无需重新部署。线上不再读取旧的 `ADMIN_PASSWORD_HASH` 或 Blobs 密码记录。

`NETLIFY_ENV_TOKEN` 是后端访问环境变量 API 的令牌，须保密；`NETLIFY_ACCOUNT_ID` 指定团队，`NETLIFY_SITE_ID` 指定本项目，所有读写均限定到这个站点的 `ADMIN_PASSWORD`。改密只更新生产环境的这个值，不改其他上下文、其他项目、GitHub 或 `SESSION_SECRET`，也不触发构建。环境变量 API 不可用时拒绝登录或改密，公开资料仍可读取。首次安装这个认证功能需要部署一次。

本地开发仍使用初始 `ADMIN_PASSWORD_HASH` 和 `.local-data/staging/` 中的私有哈希记录，改密不回写 `.env.local`。本地与线上密码独立，不会自动同步；`setup:admin --rotate` 只更新本地初始配置，不覆盖本地已保存的后台密码。

```sh
pnpm test           # 数据、前台逻辑、后端、安全和部署规则测试
pnpm build         # 生产构建
pnpm preview       # 使用生产构建，同时启动本地后端
pnpm test:e2e      # 浏览器验证，默认使用已安装的 Microsoft Edge
```

浏览器测试使用独立临时数据，不会改动正式档案。Linux CI 可设置 `PLAYWRIGHT_CHANNEL=chromium` 并先安装 Playwright Chromium。

## Cloudflare 历史方案（已停用）

创建一个新的 Worker，并关联这个 GitHub 仓库的 `main` 分支。Worker 名称须与 `wrangler.jsonc` 中的 `name` 一致。构建命令使用 `pnpm build`，部署命令使用 `pnpm deploy:cloudflare`；Node 使用 22.13 或更新版本，pnpm 版本由 `package.json` 固定。不要创建仅上传静态文件的项目，后台也需要运行 Worker。

在 Worker 的 Settings → Variables and Secrets 配置下列变量。密码按你的需求使用可查看的明文变量；令牌和会话密钥使用 Secret，不放入构建变量、GitHub 或浏览器代码。

| 环境变量 | 配置 |
| --- | --- |
| `ADMIN_PASSWORD` | 明文 Text，非空；没有字符数限制 |
| `GITHUB_TOKEN` | Secret，仅此仓库的 Contents 读写令牌 |
| `SESSION_SECRET` | Secret，至少 32 个字符的随机值 |
| `CLOUDFLARE_ACCOUNT_ID` | Text，当前账号 ID |
| `CLOUDFLARE_ENV_TOKEN` | Secret，允许读取和编辑此 Worker 的设置 |

`GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH` 和 `CLOUDFLARE_WORKER_NAME` 已在 Wrangler 中配置。`keep_vars` 保留在控制台设置的变量。首次部署会创建 `SeminarState` SQLite Durable Object，用于私有会话、限流、并发锁和临时上传；报告及最终附件仍存放在 GitHub。

后台修改密码会同步更新 Cloudflare 的 `ADMIN_PASSWORD`。忘记密码时可直接修改控制台中的这个变量并部署变量变更；认证实时读取 Cloudflare API 中的最新密码和版本，旧会话自动失效。改密只替换密码绑定，其他变量、Secret、静态资源及 Durable Object 绑定继承原值。

配置 Cloudflare Git 构建时，Build watch paths 应排除 `content/**`、`attachments/**`、`sources/**`，资料更新即时从 GitHub 读取，不必重复构建。GitHub 自动部署关联的当前状态见 [部署记录](docs/cloudflare-deployment.md)。后台提交也包含 `[skip netlify] [skip ci]`。

迁移验证命令：

```sh
pnpm test
pnpm build
pnpm exec wrangler deploy --dry-run --outdir .local-data/cloudflare-deployment/bundle
node scripts/verify-cloudflare-runtime.mjs
```

最后一项使用实际 workerd 和 SQLite Durable Object 验证 50 MiB 上传、字节指纹、登录、改密、环境变量变更及退出。外部 GitHub 和 Cloudflare API 在此测试中使用隔离的测试服务，测试附件不会进入正式仓库。

## 部署到 Netlify

Render 部署已取消，新建的服务和项目已删除；不再使用 Render 预览。仓库保留相关适配代码，当前线上服务仅使用 Netlify。

1. 在 Netlify 选择从 GitHub 导入项目，选择这个仓库的 `main` 分支。
2. 构建配置已写在 `netlify.toml`：构建命令 `pnpm build`，发布目录 `dist`，函数目录 `netlify/functions`。无需额外数据库。
3. 在 GitHub 创建一个 [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new)。Repository access 只选这个仓库，Repository permissions 中的 **Contents** 设为 **Read and write**；Metadata 为默认读取。设置适合的有效期，到期前替换令牌。
4. 在 Netlify 的 Project configuration → Environment variables 配置下表中的变量，至少让 Functions 可用。首次设置后执行一次部署。
5. 打开网站和 `/admin.html`。使用 `ADMIN_PASSWORD` 中的密码登录，上传讲义并保存报告。

| 环境变量 | 值或来源 |
| --- | --- |
| `GITHUB_OWNER` | `a-p-seminar` |
| `GITHUB_REPO` | `analysis-probability-seminar` |
| `GITHUB_BRANCH` | `main` |
| `GITHUB_TOKEN` | 刚创建的仓库专用令牌 |
| `ADMIN_PASSWORD` | 可查看的明文管理员密码，没有字符数限制，非空，Production 上下文 |
| `NETLIFY_ENV_TOKEN` | Netlify 个人访问令牌，后端用于读取和更新密码变量；勾选秘密值 |
| `NETLIFY_ACCOUNT_ID` | 本项目所属团队的 ID 或 slug |
| `NETLIFY_SITE_ID` | 本项目的 Project ID（UUID）；也可使用平台自动提供的 `SITE_ID` |
| `SESSION_SECRET` | 本机 `.env.local` 中同名变量的完整值 |

不要给这些秘密变量添加 `VITE_` 前缀，不要把 `.env.local`、登录密码或 GitHub 令牌提交到仓库。GitHub 令牌仅由服务器使用。

Netlify Blobs 用于私有会话、登录及改密限流、改密并发锁和临时上传分片，使用平台自动提供的站点身份。线上密码本身只保存在 Netlify 环境变量中。最终 JSON 和讲义存放在 GitHub，Blobs 不是讲义文件源。每次上传初始化会清理过期分片。

可以从 Netlify 免费方案开始，但免费额度和请求、流量限制以你的账户当前方案为准。项目没有付费转换接口或额外数据库依赖。GitHub 原始文件在不同地区的访问表现不同；大量访问或资料增长时可保留这套页面，替换文件存储。

## 日常更新

在后台新增或选中一场报告，填写信息。需要讲义时选择 PDF、PPT 或 PPTX，等待上传完成，再点击保存。“链接”栏第一行填写该报告的会议网址，留空则卡片不跳转。保存后刷新前台即可读取新资料；访客普通刷新可能受到最多约 15 秒的 API 缓存影响。

文件上传完成时已进入 `attachments/报告年份/YYMMDD_报告人_报告名第一个单词_附件ID.ext`，年份下直接存放文件，不创建 ID 子目录。ID 由服务端生成并保留在文件名中，同场报告的多份文件不会覆盖；保存报告后才会出现在公开页面。英文标题取首个空格分隔的词，中文标题无空格时作为一个词，超长名称安全截短并保留完整 ID。移除附件入口不会删除 Git 历史中的文件；删除报告也只移除该条记录，防止误删其他报告使用的资料。取消编辑后没有被引用的文件可以日后在 GitHub 手动整理。

公开资料在 `content/seminars.json`，讲义在 `attachments/`。当前预览清单在 `sources/`。后台不支持 Excel 导入，也不需要 WPS OpenAPI 授权。

## 为什么上传不会重新部署

```text
访客浏览器 ──GET /api/content──> Cloudflare Worker / Netlify Function ──> GitHub 的实时 JSON
      │
      └── PDF 阅读器 ──> GitHub attachments/ 原始文件

管理后台 ──登录 / 编辑 / 分片上传──> Cloudflare Worker / Netlify Function
                                      │
                                      ├── Durable Object / Netlify Blobs：私有会话和临时分片
                                      └── GitHub：JSON、附件和版本记录
```

后台生成的 GitHub 提交均带 `[skip netlify]`。此外，`scripts/ignore-build.mjs` 在检测到仅 `content/`、`attachments/`、`sources/` 改动时跳过构建。因此，在 GitHub 网页直接更新这些目录也会跳过部署。修改网页代码、后端、依赖或配置仍然正常构建；手动部署或 build hook 仍可主动触发构建。

资料目录不打包进 `dist`。前台每次向后端获取内容，因此跳过构建不会让网站停留在旧数据。附件文件名带随机 ID；替换讲义应上传新文件，再移除旧入口。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `src/main.jsx` | 公开讲座档案 |
| `src/admin.jsx` | 管理后台 |
| `src/viewer.jsx` | PDF 阅读器 |
| `server/` | 验证、会话、上传、GitHub 与本地存储适配器 |
| `netlify/functions/api.mjs` | Netlify 后端入口 |
| `cloudflare/worker.mjs` | Cloudflare 前后端入口及 SQLite Durable Object |
| `wrangler.jsonc` | Cloudflare 资源、路由与部署配置 |
| `content/seminars.json` | 当前发布的结构化讲座资料（预览版 5 条） |
| `attachments/` | 实际 PDF/PPT/PPTX 文件 |
| `sources/` | 预览资料清单与附件来源 |
| `tests/` | 功能、安全、数据及浏览器验证 |

## 相关官方文档

- [Netlify 跳过构建](https://docs.netlify.com/build/configure-builds/ignore-builds/)
- [Netlify Functions 配置与请求限制](https://docs.netlify.com/build/functions/configuration/)
- [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
- [Netlify 环境变量 API](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/#environment-variables)
- [GitHub Git Database API](https://docs.github.com/en/rest/git)
- [PDF.js](https://mozilla.github.io/pdf.js/)
