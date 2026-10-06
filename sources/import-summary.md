# 历史资料迁移核对

两个原始网站共有 91 条记录，其中 2 场重复，合并后为 **89 场历史报告**。保留新后台已有的 7 条记录，其中 2 场是新增加的报告，最终 **91 场**。

| 来源 | 2023 | 2024 | 2025 | 2026 | 合计 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 旧讨论班主页 | 28 | 26 | 2 | 0 | 56 |
| 旧 GitHub 学术档案 | 0 | 0 | 24 | 11 | 35 |
| 去重后的历史报告 | 28 | 26 | 24 | 11 | 89 |
| 保留后台新增后的最终数据 | 28 | 26 | 24 | 13 | 91 |

重复报告为许地生（2025-02-25）和邱彦奇（2025-02-26）。旧仓库 myweb.html 的四张示例卡片没有真实报告人及附件，未计入。

## 附件

保存了 **30 份历史 PDF**：旧主页关联的 25 份、GitHub 页面直接关联的 4 份，以及学校公告中 Loïc Merel 的 1 份。另保留后台上传的 1 份测试 PDF，最终共有 **31 个附件引用**。所有文件采用已有上传规则 `YYMMDD_报告人_标题.pdf`，中文和英文标题的正常空格保留，系统不允许的字符按上传规则替换，过长文件名按 UTF-8 字节数截短。原始文件内容没有变化。

例如 `250909_Maria Loukaki_Chebotarev's theorem for groups of order $pq$ and an uncertainty principle.pdf`。胡张楠（2023-08-08）、周青龙（2023-03-08）各有两份内容不同的 PDF，文件名相同但放在各自附件 ID 的目录下，避免覆盖。所有旧名称、新名称、文件大小、SHA256 和来源见 [import-report.json](import-report.json)。

以下 5 份原始文件已返回 404，无法取得，没有生成空文件或伪造附件：

- https://perso.math.u-pem.fr/liao.lingmin/SAP-WH/WEN_Zhiying.pdf
- https://perso.math.u-pem.fr/liao.lingmin/SAP-WH/WU_Lei.pdf
- https://perso.math.u-pem.fr/liao.lingmin/SAP-WH/HE_Weikun.pdf
- https://raw.githubusercontent.com/a-p-seminar/Seminar-of-Analysis-and-Probability/main/PPT/251227donghankim.pdf
- https://raw.githubusercontent.com/a-p-seminar/Seminar-of-Analysis-and-Probability/main/PPT/251227libing.pdf

旧 GitHub 页的 29 个空或 `#` 下载按钮未导入附件。原链接和失效情况仍保留在核对清单中。

## 摘要与原始数据差异

历史报告有 **85 场**保存了原文摘要；另 4 场没有找到可确认属于该次报告的原始摘要，保留真实报告和可用讲义，不补写摘要：

- 2023-11-01 董长光：Introduction to Fermi Acceleration Problem in Dynamical Systems
- 2023-07-19 史汝西：Multiplicity of topological dynamical systems
- 2023-03-22 侯晓博：Multi- Horseshoe Dense Property and Intermediate Entropy Property of Ergodic Measures with Same Level
- 2023-02-03 史汝西：Zero- dimensional and Symbolic Extensions of Topological Flows

张倩、麻彩云两场按用户要求采用旧讨论班目录的 **2024-12-27**；学校公告中的 2024-12-30 仅作为日期差异记录，未用于显示日期。董长光的目录为 2023-11-01、讲义为 2023-10-31，原公告失效，暂保留目录日期并注明差异。蒋赉的学校公告开始和结束年份不一致，保留目录及后台现有的 2026-08-05。

邱彦奇、Rene Pfitscher、Maria Loukaki 的公告链接已按标题、报告人和时间核对，移除错误的读者跳转链接；原链接仍在核对清单。两场 Gerardo GONZALEZ-ROBERT 和吴雷的摘要由匹配的学校原公告恢复。原始 HTML、公告快照和转录依据保存在本目录，摘要不做自动改写。

本次迁移保留后台现有的站点设置、报告 ID、标题、报告人、日期时间、单位、地点、摘要及已上传文件；仅按要求改名旧附件。迁移基于提交 `fc192503dc739f7aa6726975bce9506dd896b4ed`，以一次非强制 Git 分支更新发布，资料更新使用 `[skip netlify]`，无须重新部署前后端。
