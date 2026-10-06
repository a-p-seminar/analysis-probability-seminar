# Cloudflare 部署记录（已停用）

按用户要求，`ap` Worker、部署和配置已删除，账号 Worker 数量已确认为 0。当前使用 Netlify：[前台](https://s-ap.netlify.app/) · [后台](https://s-ap.netlify.app/admin.html)。正式报告和附件仍保存在 GitHub，未受影响。以下内容为此前迁移与验证的历史记录。

项目：分析与概率讨论班。部署代码保存在 `a-p-seminar/analysis-probability-seminar` 的 `main` 分支。

## 访问地址

- 前台：<https://ap.whucc.workers.dev/>
- 后台：<https://ap.whucc.workers.dev/admin.html>
- Worker：`ap`

Worker 已从 `s-ap` 就地改名为 `ap`，账号免费子域名改为 `whucc`。Worker 的固定 ID、SQLite Durable Object 和全部绑定保留，后台的 `CLOUDFLARE_WORKER_NAME` 与 Wrangler 配置同步改为 `ap`。旧的 Cloudflare 地址不再作为入口。新域名 HTTPS 已生效；主页、后台、PDF 阅读器与公共接口均返回 200，登录、会话和退出检查通过。域名变更后的报告内容仍与迁移前版本逐条一致。

## 内容与附件

迁移前版本：`5f2fcd28d863ffcd5c2202bf88373fd018d7a55d`。

Cloudflare 实现版本：`9c9a309895bce473ea1c891f16144bdd387634cd`。

- 91 场报告，30 份 PDF。
- Cloudflare 公共接口返回的全部报告内容与迁移前版本逐条一致。
- `content/` 和 `attachments/` 的全部 Git blob SHA 均与迁移前版本一致。
- 实际下载 30 份 PDF，文件长度和 Git blob SHA 全部匹配。
- 原日期、报告 ID、附件 ID、文件名及年份目录保持一致。
- 张倩、麻彩云两场报告仍使用原始档案中的 `2024-12-27`。

## 后端

Worker 同时服务前台、后台和 `/api/*`。`SeminarState` SQLite Durable Object 保存私有会话、限流状态、并发锁和临时上传分片；正式报告与附件继续存放在 GitHub。

管理员密码使用 Cloudflare 可查看的 Text 变量 `ADMIN_PASSWORD`。GitHub 令牌、会话密钥及仅限此 Worker 的环境变量操作令牌使用 Secret。密码与秘密令牌不写入源码、静态资源或 GitHub。

后台改密同步修改 `ADMIN_PASSWORD`；直接修改这个变量也会使旧会话失效。改密保留其他变量、Secret、静态资源及 Durable Object 绑定。

## 已执行验证

- 84 项单元测试通过。
- Vite 生产构建和 Wrangler 部署校验通过。
- 实际 workerd / SQLite Durable Object 验证：同时完成三份 50 MiB 上传，最大并行组装数为 1，上传字节指纹匹配。
- 线上验证：登录、Secure / HttpOnly 会话、管理员资料读取、上传初始化与取消、改密往返、直接修改环境变量后的旧会话失效、退出均通过。
- 环境变量变更后曾短暂返回 503；随后重新登录、读取会话、退出均恢复正常。
- 浏览器验证：前台显示 91 场报告，后台编辑表单正常加载；曹杰的讲义阅读器加载 29 页，页面、缩略图和阅读控件均显示。

## 部署更新

GitHub 自动部署关联尚未完成。生产构建配置应使用 `pnpm build` 和 `pnpm deploy:cloudflare`，仅匹配 `main`，排除 `content/**`、`attachments/**`、`sources/**`。

原 Netlify 项目继续保留。迁移平台与修改免费域名不能保证微信恢复直接访问。
