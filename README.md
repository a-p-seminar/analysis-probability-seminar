# 分析与概率讨论班

武汉大学 · 华中师范大学联合分析与概率讨论班网站。首页展示报告，后台管理资料和讲义，正式数据保存在 GitHub。

## 网站入口

| 用途 | 地址 |
| --- | --- |
| 网站首页 | https://s-ap.onrender.com/ |
| 管理后台 | https://s-ap.onrender.com/admin.html |
| GitHub 仓库 | https://github.com/a-p-seminar/analysis-probability-seminar |
| Render 控制台 | https://dashboard.render.com/web/srv-db2tnh4s728c73akq2s0 |

当前使用 [Render 免费服务](https://render.com/docs/free)，闲置后首次打开可能需要等待约一分钟。Netlify 原项目保留，自动部署暂停。Vercel 已移除。GitHub 不运行测试工作流。

## 日常更新报告和讲义

1. 登录管理后台，选择已有报告，或点击“新建报告”。
2. 填写标题、报告人、单位、日期和时间。单位选填，多个单位或中英文名称用 `/` 分隔。
3. 所有时间均按北京时间。结束时间默认比开始时间晚一小时，可以单独调整。
4. 有具体地点时填写学校和地点；没有地点就留空。粘贴完整摘要，公告链接填写对应报告的学校公告地址。
5. 点击“上传文件”添加 PDF、PPT 或 PPTX，每份最大 50 MiB。上传完成后点击“保存报告”，附件才会随报告发布。

保存后，资料和附件会直接写入 GitHub。刷新首页即可看到更新，缓存最多约 15 秒，资料更新不需要重新部署。

附件自动放入 `attachments/年份/`，文件名为 `YYMMDD_报告人_标题首词_附件ID.ext`。首页按月份展示全部报告，并根据结束时间自动归入“即将举行”或“已经举行”。

## 修改密码

**知道当前密码**：登录后台，点击“修改密码”，填写当前密码、新密码和确认密码，保存后重新登录。

**忘记线上密码**：打开 Render 控制台，进入左侧 **Environment**，找到 `ADMIN_PASSWORD`，修改值并选择 [Save only](https://render.com/docs/configure-environment-variables)。本项目实时读取平台里的密码变量，改密不需要重新部署。Netlify 的密码在它自己的同名环境变量中修改，两边互不影响。

密码没有长度下限，不能为空或全为空格。密码值、`GITHUB_TOKEN`、`SESSION_SECRET` 和平台 API 令牌留在平台环境变量或本机私有配置中，不写入源码。

## 美化网页

根据需要修改下列文件：

| 想调整的内容 | 文件 |
| --- | --- |
| 首页字体、字号、颜色、间距、手机和 iPad 排版 | `src/archive.css`、`src/styles.css` |
| 首页内容、标题区和筛选 | `src/main.jsx`、`src/SeminarIntro.jsx`、`src/ArchiveFilters.jsx` |
| 后台表单排版与字号 | `src/admin.css` |
| 后台字段和按钮 | `src/admin.jsx` |
| 科赫雪花曲线与 `a · p` 标志 | `src/FractalArtwork.jsx` |
| 浏览器图标与苹果设备图标 | `public/icons/` |
| 武大背景 | `public/images/whu-enhanced.png` |
| 华师背景 | `public/images/ccnu-autumn-enhanced.png` |
| PDF 阅读页面 | `src/viewer.jsx`、`src/viewer.css` |

更换背景时使用同名图片；调整字号和间距时修改对应 CSS。先在本地打开页面查看效果，再上传改动。

## 本地查看效果

安装 Node.js 24 和 pnpm 11.19.0，在项目目录运行：

```sh
pnpm install
pnpm setup:admin
pnpm dev
```

打开 `http://127.0.0.1:5173/`，后台地址是 `http://127.0.0.1:5173/admin.html`。首次生成的本地登录密码在 `.local-data/admin-login.txt`，本地配置在 `.env.local`。

本地后台修改的是本机的 `content/seminars.json` 和 `attachments/`。更新正式报告请使用线上后台。

## 美化后怎么上传

**少量文字或样式修改**：在 GitHub 仓库打开对应文件，点击编辑，修改后提交到 `main`。图片通过 **Add file → Upload files** 上传到对应目录。

**本地修改多个文件**：用 GitHub Desktop 克隆上方这个仓库，修改并预览页面。完成后运行一次 `pnpm build`，确认网页能打包；在 GitHub Desktop 中选择改过的源码和图片，填写提交说明，点击 **Commit to main**，再点击 **Push origin**。按钮位置见 [GitHub Desktop 官方操作说明](https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop)。

上传的是 `src/`、`public/` 等源码文件；修改依赖时一起上传 `package.json` 和 `pnpm-lock.yaml`。`dist/`、`node_modules/`、`.env.local` 和 `.local-data/` 留在本机。

Render 会自动获取 `main` 的代码修改并部署。打开 Render 控制台的 **Deploys**，看到最新记录为 **Live** 后刷新网站。后台更新报告、上传讲义或只修改 README 时不会触发构建。Netlify 继续保持暂停。

## 资料和备份

正式报告在 `content/seminars.json`，正式讲义在 `attachments/`，历史来源和迁移核对记录在 `sources/`。这些内容保留在仓库中。

测试脚本、旧开发计划和 Vercel 配置已移除。删除前的文件可以从 GitHub 提交历史恢复；本机清理备份保存在被 Git 忽略的 `.local-data/` 中。
