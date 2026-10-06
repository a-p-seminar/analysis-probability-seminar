# 分析与概率讨论班

武汉大学 · 华中师范大学的分析与概率讨论班档案。前台展示完整报告，后台编辑资料并把讲义存入这个 GitHub 仓库。网站适合部署到 Netlify。

**历史资料已完整迁移：两个原始网站有 56 场和 35 场报告，去掉 2 场重复后共有 89 场历史报告。** 本次还保留了新后台增加的 2 条记录，迁移时共 91 场报告、31 份 PDF，覆盖 2023—2026 年。此后可继续通过后台更新。

原始资料来自 [讨论班原始主页](https://perso.math.u-pem.fr/liao.lingmin/SAP-WH.html) 和 [学术档案仓库](https://github.com/a-p-seminar/Seminar-of-Analysis-and-Probability)。逐条来源、去重依据、附件改名和文件指纹见 [迁移核对说明](sources/import-summary.md) 与 [完整核对清单](sources/import-report.json)。原来源中有 5 份附件已失效，4 场摘要未能确认，均保留记录并注明，未生成替代内容。讲座摘要和讲义的权利归原作者所有。

## 可以做什么

- 每页显示 10 场报告，按北京时间的结束时间区分“即将举行”和“已结束”；悬浮筛选栏提供年份、月份下拉选择和关键词搜索。
- 每条报告使用独立卡片，按题目、报告人及单位、日期时间地点的顺序展示；摘要默认收起，点击后展开完整内容。点击青蓝色标题会在新窗口打开该报告的会议链接，摘要和附件独立操作。
- 页首展示中英文标题和科赫雪花曲线内的 a · p 标志；点击分形图在新窗口打开管理页面。组织者及轮流举办说明在桌面直接显示，手机和 iPad 通过右下角“关于”按钮展开。前台隐藏导入备注和原始记录链接，来源信息仍保留在数据中。
- 只有真实的 PDF、PPT、PPTX 附件才显示“讲义 · PPT”入口；PDF 有独立阅读器、缩略图、缩放、下载和打印。PPT/PPTX 保留原文件下载。
- `/admin.html` 提供密码登录、新增、编辑、删除、链接和附件上传；编辑表单不再显示补充说明。没有附件的报告也可以正常发布。
- 后台与前台采用相同的白底蓝色风格，可组合筛选年份、月份、起止日期和关键词；筛选不影响正在编辑的草稿。地点由“武大／华师”学校选项和具体地点组成，公开页面显示为“武大·…”或“华师·…”。
- 单个附件上限 50 MiB，分片上传并显示进度，服务器验证扩展名和文件头；自动命名为 `YYMMDD_报告人_标题.ext`，保留正常空格，替换系统不允许的字符。
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

## 部署到 Netlify

另有 Render 免费静态预览：构建命令 `corepack pnpm install --frozen-lockfile && corepack pnpm build:preview`，发布目录 `dist-preview`，Node 22。`render.yaml` 记录对应配置。此预览只发布当前选中的报告和附件，支持筛选、会议链接和 PDF 阅读，不启用后台登录、编辑或上传；当前内容随代码部署更新。完整后台仍使用下方的 Netlify 方案。本地用 `node node_modules/@playwright/test/cli.js test --config playwright.preview.config.mjs` 验证预览构建。

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

文件上传完成时已进入 `attachments/年份/附件ID/日期_报告人_标题.ext`，但保存报告后才会出现在公开页面。附件 ID 目录使同一报告的多份不同文件能够保留相同的显示名称。移除附件入口不会删除 Git 历史中的文件；删除报告也只移除该条记录，防止误删其他报告使用的资料。取消编辑后没有被引用的文件可以日后在 GitHub 手动整理。

公开资料在 `content/seminars.json`，讲义在 `attachments/`。当前预览清单在 `sources/`。后台不支持 Excel 导入，也不需要 WPS OpenAPI 授权。

## 为什么上传不会重新部署

```text
访客浏览器 ──GET /api/content──> Netlify Function ──> GitHub 的实时 JSON
      │
      └── PDF 阅读器 ──> GitHub attachments/ 原始文件

管理后台 ──登录 / 编辑 / 分片上传──> Netlify Function
                                      │
                                      ├── Netlify Blobs：私有临时分片
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
