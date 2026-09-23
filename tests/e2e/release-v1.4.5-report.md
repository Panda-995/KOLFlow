# v1.4.5 发布验证报告

## 1. 执行概览

2026-09-23，Windows / Node.js 22 / 本地无头 Chrome。版本 Web / Docker / Android 1.4.5，Android versionCode 12，UGOS Pro 1.4.5.0014。验证对象包括本次已有的界面、状态管理、备份、认证、金额与容器改动。

本地结果：91/91 业务接口回归、22/22 浏览器用例通过；类型检查、ESLint、前后端构建通过。补充 v3/v4 备份恢复的定向用例通过。使用 npm 主站审计，已报告漏洞 0。

## 2. 测试范围

CORE-01 / E2E-01：注册、HTTP 加密认证、账号安全和切换隔离、商单及模板、品牌关联、账单金额、资产、待办与日程、完整周期通知、备份恢复及 WebDAV 可控测试、加载失败重试、PC/移动布局、弹窗、图标及详情素材。

UPGRADE-01：从 v1.4.4 数据库模块创建 12 表历史数据，加载新模块，逐表检查全部原字段与记录；只允许增加 users.tokenVersion（默认 0）和 idx_todos_upcoming 索引。保留原表结构及旧索引，integrity_check=ok，foreign_key_check 无错误。复制升级后的数据到新目录，再次加载所有记录一致。

新版导出 v4，测试保留无版本旧数据、v2/v3 导入能力；这不代表旧程序可以读取 v4 备份。回退应使用升级前备份。已有 darkMode 字段不会从旧库删除，新版主题通过本地设置处理。

## 3. 失败与环境处理

- GitHub 直连存在偶发 EOF / TLS 握手失败，使用 HTTP/1.1 和有界重试获取产物，不使用代理或浏览器。
- 配置的 npm 镜像不支持 audit 接口，切换 npm 主站审计后结果为 0 个已报告漏洞。
- 功能与浏览器测试未发现失败；云端及安装包结果见后续章节。

## 4. 脚本与产品修复

NATIVE-01：旧升级脚本要求数据库完全不变，不适用于本版明确新增的会话字段和索引。新增共享迁移验证，逐列检查旧数据，仅允许上述两项加法变化；本地通过。原生验证使用全部 12 表样本、以 node 身份读写数据库，并增加“目录为 node、旧 SQLite 为 root 且权限 600”的迁移场景。

修复容器入口仅检查目录属主的遗漏：现在处理应用目录、uploads 目录及 SQLite / WAL / SHM 文件；不递归修改所选共享目录中无关文件。启动仍降权到 node。

去除旧镜像不可用时跳过兼容验证的发布逻辑；本次跨版本检查失败会阻止双架构清单发布。

## 5. 缺陷状态

数据目录属主检查遗漏已修复，云端双架构迁移及混合属主场景均通过。没有忽略测试失败或降低业务断言。

## 6. 验证边界与建议

所有测试使用隔离目录和合成数据，不操作用户业务数据库。没有连接 NAS / Android 真机，不声称所有硬件环境或真实外部 WebDAV 服务已验证。Android 从 debug 构建改为 release 构建，仍须验证旧证书一致，才能支持覆盖更新。

## 7. 证据

计划：tests/e2e/release-v1.4.5-plan.md。日志：.tmp-release-v1.4.5/{unit-tests,e2e-tests,lint-final,build-server,upgrade,backup-compat}.log 和 audit-official.json。迁移检查：scripts/verify-storage-migration.mjs、scripts/verify-container-storage.sh。浏览器报告：test-results/e2e-report/。

## 8. 云端 CI、镜像及升级结果

源码标签 v1.4.5 对应提交 `4c7313c8386110074e3c2ff341daf2a9a506473e`。

- [CI](https://github.com/Panda-995/KOLFlow/actions/runs/35856579752)通过：Linux 中 91 项回归及 22 项浏览器测试全部通过，类型、代码规范、前端构建通过。CI 的 PR 镜像作业在 main 按设计跳过；正式镜像由发布工作流验证。
- [镜像发布工作流](https://github.com/Panda-995/KOLFlow/actions/runs/35856579730)通过：原生 amd64 和 arm64 构建、启动、静态资源检查成功。
- 两架构都通过 v1.4.4 全部 12 表样本升级、原目录读写与重启、中文/空格目录迁移与重启、node 目录下 root 所有且权限 600 的旧数据库迁移。验证以 node 身份执行，应用主进程非 root。原有表字段、历史记录、原索引和约束保持，新增字段与索引正确，完整性及外键正常。
- Compose 中加密注册/登录、鉴权、完整周报和重启后的业务数据均通过。
- 本地验证旧 JWT 未带 ver 字段时升级后仍有效，撤销会话后立即失效（测试事务回滚，不改动升级样本）。
- GHCR 和 Docker Hub 的 1.4.5 清单均含 linux/amd64、linux/arm64，对应摘要一致：
  - amd64: `sha256:f8ebbeab6f9557aff8903fc72de7255d784434a4249e852a9962fe9ac494df2f`
  - arm64: `sha256:9e7751ad438269e64ed234a1dcef0c8e17e09d2104024f10f424d1101ca6d320`

## 9. Android

[Android 构建](https://github.com/Panda-995/KOLFlow/actions/runs/35856584506)通过。使用 release 构建并沿用既有签名证书。

- 下载 APK 独立核验：`com.kolflow.app`，versionName `1.4.5`，versionCode `12`，minSdk `22`，targetSdk `36`。
- v1/v2 签名验证通过，证书 SHA256 `1372e14bf045bcfd156698b574912a89a9c6df15b82b1379b5d7cca2a0df27fa`，与 v1.4.4 一致。
- 图标和六张详情图与源文件逐字节一致，下载文件 SHA256 匹配 GitHub 附件摘要及构建校验清单。

## 10. 正式绿联安装包与 Release 附件

[UGOS Pro 双架构构建](https://github.com/Panda-995/KOLFlow/actions/runs/35857084512)成功，版本为 `1.4.5.0014`。缺省、空列表、空值、普通目录、中文空格目录和带引号/井号/冒号目录的六种 Go 模板渲染检查通过。

两份正式 UPK 均已完整下载，逐层读取 UPK / UGB / 镜像归档，独立核验以下内容：

- 应用 ID `com.panda.kolflow`、版本和架构正确，包头及内部图标与源文件一致。
- 中英文安装说明正确，邀请码 6–64 位、必填和可修改属性保留。
- 数据文件夹为单选路径、可选且可修改；分别运行两个包内的实际模板，六种场景均仅生成一个正确挂载。
- 每个精简运行镜像内的 dist 图标及六张详情图共 7 个文件与原图逐字节一致。生产镜像只保留运行所需资源，未再携带重复 public 目录。
- 中文功能描述超过 100 个汉字，与源配置一致，无新增第三方授权或合作声明。

上架素材 ZIP 完整下载，图标、六张详情图、更新说明及内部校验清单正确。双架构 UPK、APK、素材 ZIP 和构建校验文件共 6 个产物的大小与 GitHub SHA256 摘要全部一致；本报告及总校验清单加入后共 8 个附件。

下载过程遭遇 TLS 握手失败和大请求超时，最终使用不转发 GitHub 令牌到签名下载域名的直连分段请求完整获取全部文件。未把不完整文件作为交付结果。

GHCR 与 Docker Hub 的 latest 清单与 1.4.5 清单一致。本地交付目录为 `.tmp-release-v1.4.5/downloads/`。所有要求的自动化发布检查通过，仍保留 NAS / Android 真机及真实外部服务的验证边界。
