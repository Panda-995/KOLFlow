# v1.4.5 发布验证报告

## 1. 执行概览

2026-09-23，Windows / Node.js 22 / 本地无头 Chrome。版本 Web / Docker / Android 1.4.5，Android versionCode 12，UGOS Pro 1.4.5.0014。验证对象包括本次已有的界面、状态管理、备份、认证、金额与容器改动。

本地结果：91/91 业务接口回归、22/22 浏览器用例通过；类型检查、ESLint、前后端构建通过。补充 v3/v4 备份恢复的定向用例通过。使用 npm 主站审计，已报告漏洞 0。

## 2. 测试范围

CORE-01 / E2E-01：注册、HTTP 加密认证、账号安全和切换隔离、商单及模板、品牌关联、账单金额、资产、待办与日程、完整周期通知、备份恢复及 WebDAV 可控测试、加载失败重试、PC/移动布局、弹窗、图标及详情素材。

UPGRADE-01：从 v1.4.4 数据库模块创建 12 表历史数据，加载新模块，逐表检查全部原字段与记录；只允许增加 users.tokenVersion（默认 0）和 idx_todos_upcoming 索引。保留原表结构及旧索引，integrity_check=ok，foreign_key_check 无错误。复制升级后的数据到新目录，再次加载所有记录一致。

新版导出 v4，测试保留无版本旧数据、v2/v3 导入能力；这不代表旧程序可以读取 v4 备份。回退应使用升级前备份。已有 darkMode 字段不会从旧库删除，新版主题通过本地设置处理。

## 3. 失败与环境处理

- GitHub CLI 使用 HTTP/2 时出现 EOF；禁用该客户端的 HTTP/2 后令牌直连正常，不使用代理或浏览器。
- 配置的 npm 镜像不支持 audit 接口，切换 npm 主站审计后结果为 0 个已报告漏洞。
- 功能与浏览器测试未发现失败；云端容器及发布包待构建后补充，不提前标记通过。

## 4. 脚本与产品修复

NATIVE-01：旧升级脚本要求数据库完全不变，不适用于本版明确新增的会话字段和索引。新增共享迁移验证，逐列检查旧数据，仅允许上述两项加法变化；本地通过。原生验证使用全部 12 表样本、以 node 身份读写数据库，并增加“目录为 node、旧 SQLite 为 root 且权限 600”的迁移场景。

修复容器入口仅检查目录属主的遗漏：现在处理应用目录、uploads 目录及 SQLite / WAL / SHM 文件；不递归修改所选共享目录中无关文件。启动仍降权到 node。

去除旧镜像不可用时跳过兼容验证的发布逻辑；本次跨版本检查失败会阻止双架构清单发布。

## 5. 缺陷状态

数据目录属主检查遗漏已修复，需以云端双架构场景验证作为最终发布门禁。没有忽略测试失败或降低业务断言。

## 6. 验证边界与建议

所有测试使用隔离目录和合成数据，不操作用户业务数据库。没有连接 NAS / Android 真机，不声称所有硬件环境或真实外部 WebDAV 服务已验证。Android 从 debug 构建改为 release 构建，仍须验证旧证书一致，才能支持覆盖更新。

## 7. 证据

计划：tests/e2e/release-v1.4.5-plan.md。日志：.tmp-release-v1.4.5/{unit-tests,e2e-tests,lint-final,build-server,upgrade,backup-compat}.log 和 audit-official.json。迁移检查：scripts/verify-storage-migration.mjs、scripts/verify-container-storage.sh。浏览器报告：test-results/e2e-report/。
