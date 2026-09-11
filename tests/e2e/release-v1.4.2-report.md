# v1.4.2 发布验证报告

日期：2026-09-11。版本：Web / Docker / Android 1.4.2，Android versionCode 9，UGOS Pro 1.4.2.0011。

## 修改范围

绿联安装页邀请码说明改为“请自定义6-64位邀请码，新用户注册 KOLFlow 账号时必须填写此邀请码。”后半句、6 至 64 位校验、必填及可修改设置保持不变。

本次未修改业务代码、数据库模块、备份格式、应用 ID、数据挂载路径、Android 权限及 API 配置。依赖锁文件除项目版本外与 1.4.1 完全一致，沿用已有签名和图标素材。

## 本地验证结果

| 检查 | 结果 |
| --- | --- |
| 类型检查、生产服务端构建、前端构建 | 全部通过 |
| 业务与接口回归 | 22/22 通过 |
| 浏览器 E2E | 3/3 通过 |
| 1.4.1 数据库原地升级 | 12 张表的全部合成历史记录和结构保持一致 |
| 数据库完整性 / 外键 | integrity_check=ok；foreign_key_check 无错误 |
| 文案及配置差异 | 前半句准确修改；后半句与长度规则不变 |

覆盖注册、HTTP 加密认证与防重放、账号安全、用户隔离、商单模板、品牌与关联记录、待办/账单/发布链接校验、资产出售、周期通知、备份 v2 导入与 v3 导出、导入容量、核心页面和 PC/移动端素材加载。

## 验证边界

使用 Windows / Node.js 22 / 本地无头 Chrome 和隔离 DATA_DIR，不操作用户业务数据库。没有连接 NAS 或 Android 真机，因此未声称完成真机安装、真机交互或所有硬件环境验证。外部 WebDAV 服务未进行在线端到端测试。依赖版本保持不变，本次不扩大到依赖升级。

## 证据

- 验证计划：`tests/e2e/release-v1.4.2-plan.md`。
- 本地原始日志：`.tmp-release-v1.4.2/unit-tests.log`、`.tmp-release-v1.4.2/e2e-tests.log`。
- 既有测试：`tests/regressions.test.ts`、`tests/weekly-report.test.ts`、`tests/e2e/release-v1.4.0.spec.ts`、`tests/e2e/release-v1.4.1.spec.ts`。
- 升级验证脚本及隔离数据：`.tmp-release-v1.4.2/upgrade.ts`、`.tmp-release-v1.4.2/upgrade-data/`。
- 发布包的构建记录、解包核验和 SHA256 结果在最终 Release 附件报告中补充。
