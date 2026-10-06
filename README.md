# 分析与概率讨论班

武汉大学 · 华中师范大学联合分析与概率讨论班档案。前台展示报告，后台编辑资料并把讲义存入 GitHub。Render、Vercel 和 Netlify 使用同一个仓库的 `main` 分支，报告与附件共享，密码和登录会话各自独立。

## 部署

- **Render**：[网站](https://ap-whucc.onrender.com/)与[后台](https://ap-whucc.onrender.com/admin.html)已上线，前后端由同一个 Node Web Service 提供，配置见 [Render 部署说明](docs/render-deployment.md) 和 `render.yaml`。
- **Vercel**：Vite 静态页面加 Node API，私有会话与上传分片使用独立 Redis；配置见 [Vercel 部署说明](docs/vercel-deployment.md) 和 `vercel.json`。
- **Netlify**：[现有网站](https://s-ap.netlify.app/)及[后台](https://s-ap.netlify.app/admin.html)保留，自动构建已暂停。只有用户要求恢复后才重新开启。

部署状态以平台实际结果为准；配置文件本身不代表服务已经上线。两套新服务使用免费方案，不自动购买升级。

## 报告档案

两个原始网站分别有 56 场和 35 场报告，去掉 2 场重复后共有 89 场历史报告。加上后来补录的杨博寒和 Mumtaz Hussain 报告，当前共 **91 场正式报告、30 份 PDF**，覆盖 2023—2026 年。

原始资料来自[讨论班原始主页](https://perso.math.u-pem.fr/liao.lingmin/SAP-WH.html)和[学术档案仓库](https://github.com/a-p-seminar/Seminar-of-Analysis-and-Probability)。来源、去重、附件改名及文件指纹见[迁移核对说明](sources/import-summary.md)和[完整核对清单](sources/import-report.json)。原来源中有 5 份附件已失效，4 场摘要未能确认，均保留核对记录。讲座摘要和讲义的权利归原作者所有。

## 页面与后台

- 展示全部报告，按北京时间的结束时间区分“即将举行 (forthcoming)”和“已经举行 (past)”，使用相同标题样式，按 `YYYY-MM` 分组。
- 筛选支持关键词、年份与月份；手机和 iPad 可收起筛选及组织者说明。
- 科赫雪花曲线内的 `a · p` 标志用于主页、后台和网站图标。
- 每条报告显示题目、报告人、单位、日期时间及地点。单位使用一个可选输入框，以 `/` 分隔多个单位或中英文名称。无具体地点时隐藏学校和地点。
- 摘要可展开，支持 TeX；公告链接限定为报告对应的学校数学学院公告。
- 单份 PDF 显示“PDF”，多份显示“PDF I”“PDF II”等；独立阅读器支持缩略图、缩放、下载和打印。PPT/PPTX 保留下载，不自动转 PDF。
- 后台支持新增、修改、删除、上传附件和修改密码。结束时间默认比开始时间晚一小时，并校验时间先后。
- 附件每份最大 50 MiB，分片上传。文件位于 `attachments/年份/YYMMDD_报告人_报告名第一个单词_附件ID.ext`，年份下不再创建 ID 子目录。
- 保存时检查版本，防止较旧的页面覆盖另一位编辑者的更新。

## 本地运行

需要 Node.js 22.13 或更新版本，pnpm 版本由 `package.json` 固定。

```sh
pnpm install
pnpm setup:admin
pnpm dev
```

前台为 `http://127.0.0.1:5173/`，后台为 `http://127.0.0.1:5173/admin.html`。本地使用 `content/seminars.json` 和 `attachments/`，本地编辑不会自动同步 GitHub。

首次初始化将登录密码保存在 `.local-data/admin-login.txt`，哈希及会话密钥保存在 `.env.local`。这些文件均被 Git 忽略。不要将密码、令牌、环境变量或 `.local-data/` 上传到仓库。

## 密码

线上密码保存在各平台自己的明文 `ADMIN_PASSWORD` 环境变量中，可以在平台控制台查看或修改。后台“修改密码”只更新当前平台的密码变量。认证实时读取平台 API，修改后旧会话失效，不需要重新构建。

密码没有字符数下限，但不能为空或全为空格。`SESSION_SECRET`、平台环境变量 API 令牌及 GitHub 令牌必须保密，不能添加 `VITE_` 前缀。平台接口不可用时拒绝管理员登录，公开报告仍可读取。各平台密码的修改不会同步到其他平台。

本地改密使用私有哈希记录，不会回写 `.env.local`，也不会影响线上密码。

## 资料更新与构建

线上后台通过 GitHub API 更新 `content/seminars.json` 和 `attachments/`。访客运行时获取最新 JSON，最多有约 15 秒缓存。报告数据和附件不打包进 `dist`。

资料更新不需要重新部署。Render 使用目录构建过滤器，Vercel 使用忽略构建命令，Netlify 使用已有忽略规则并保持暂停。修改网页、后端或依赖才需要重新构建。

GitHub 检查工作流仅手动运行。日常上传不会自动运行整套浏览器测试，也不会创建测试报告。

```sh
pnpm build                    # 生产构建
pnpm preview                  # 本地生产预览
node --test tests/render.test.mjs tests/vercel.test.mjs  # 新部署适配器检查
pnpm test                     # 需要时手动运行完整单元测试
pnpm test:e2e                 # 需要时手动运行浏览器测试
```

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `src/main.jsx` | 公开讲座档案 |
| `src/admin.jsx` | 管理后台 |
| `src/viewer.jsx` | PDF 阅读器 |
| `server/` | 会话、密码、上传及存储适配器 |
| `scripts/render-server.mjs` | Render 前后端入口 |
| `api/seminar.mjs` | Vercel 后端入口 |
| `netlify/functions/api.mjs` | Netlify 后端入口 |
| `content/seminars.json` | 当前正式报告资料 |
| `attachments/` | 正式 PDF/PPT/PPTX 文件 |
| `sources/` | 导入来源与核对证据 |
| `tests/` | 按需运行的功能、安全和浏览器检查 |

已停用的 Cloudflare Worker、Wrangler 依赖、未引用的原始背景图及测试附件已从项目中移除；私有本地备份和 Git 历史仍可恢复。
