# v1.4.1 发布验证报告

## 1. 执行概览

- 日期：2026-09-07；环境：Windows / Node.js 22.22.2 / 本地无头 Chrome。
- 版本：Web 与 Android 1.4.1；Android versionCode 8；UGOS Pro 1.4.1.0010。
- 回归：22/22 通过；E2E：3/3 通过；原地升级：1/1 通过。
- TypeScript 检查、前端和生产服务端构建通过。

## 2. 测试范围

- CORE-01 / API-01：账号隔离、HTTP 认证加密与防重放、账号安全、商单模板、品牌同步、待办/账单/发布链接校验、资产出售、周期通知、WebDAV 同步周期判断、导入限制。
- DATA-01：旧 v2 备份导入及关联数据、v3 模板导入导出、跨用户主键冲突处理。
- PAGE-01：注册、商单模板完整流程、周期通知及仪表盘、商单、账单、待办、品牌、资产、统计、日志、设置页面。
- BRAND-01：1440×900 和 390×844 登录页新图标及 favicon；全部六张详情图 HTTP 响应、格式与尺寸检查；页面无横向溢出。
- UPGRADE-01：使用 v1.4.0 提交 c20cddf 的数据库模块建立隔离数据库，在 12 张表中填入合成历史记录；新模块原地打开后逐行、逐字段及全结构比较一致，integrity_check=ok，foreign_key_check 无错误。
- 应用 ID、服务器数据挂载路径、数据库和备份代码未改变。Android 本地签名指纹与已发布版本一致：1372e14bf045bcfd156698b574912a89a9c6df15b82b1379b5d7cca2a0df27fa。

## 3. 失败与阻塞

- Android 本地 Gradle：Windows 报 Unable to establish loopback connection，属于构建环境阻塞；使用 GitHub Linux 工作流构建，签名校验通过后才上传 APK。
- 初次依赖审计：配置的 npm 镜像站审计接口返回 404；改用 npm 源站执行。
- npm 源站生产依赖审计：0 个高危/严重问题，4 个中危问题（xmldom、qs 及依赖链）；这些依赖版本与旧版相同，本次不执行可能破坏兼容性的框架强制升级。
- 未连接 NAS 或 Android 真机，因此没有将真机安装、真机覆盖升级和全部硬件环境标记为通过。

## 4. 修复与缺陷

- 本次不更改业务接口和数据库迁移。替换应用素材，更新版本及描述。
- 移除发布后自动删除旧镜像的步骤，保留今后的历史版本镜像。
- 修正 UPK 校验清单为下载目录可直接校验的文件名。
- 发布检查发现并修正重复侧栏图标及版本替换误改依赖版本的问题，最终依赖版本与旧版一致。

## 5. 风险与建议

- 自动化覆盖主要业务路径，不能代替全部 NAS、Android 设备实测。
- WebDAV 外部服务端和公网 TLS 部署未进行在线端到端验证，仅测试现有调度逻辑。
- 商店详情素材需随上架申请提交，包含在 UPK 镜像中不会自动修改应用中心页面。

## 6. 证据索引

- 本地日志：`.tmp-release-v1.4.1/`；页面截图：`test-results/branding-1440.png`、`test-results/branding-390.png`；E2E 报告：`test-results/e2e-report/`。
- 自动化脚本：`tests/regressions.test.ts`、`tests/weekly-report.test.ts`、`tests/e2e/release-v1.4.0.spec.ts`、`tests/e2e/release-v1.4.1.spec.ts`。
- 双架构镜像、UPK 和 Android 构建证据在对应 GitHub Actions 记录；Release 附带 SHA256 校验清单。
