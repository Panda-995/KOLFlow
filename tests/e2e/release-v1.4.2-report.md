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

## 发布构建及修复

- 首轮 arm64 构建在 QEMU 执行 `npm ci` 时发生 Illegal instruction（signal 4 / exit 132），amd64 和 Android 正常。改用 `ubuntu-24.04-arm` 原生 ARM 构建机后通过，未修改 Dockerfile、业务依赖或运行时逻辑。
- 发布工作流新增源码引用输入，重建明确检出 v1.4.2 标签；应用源码提交为 `265f95b4770d7b6dd06ccacdf651815ee4ccdd50`。
- [双架构构建与启动检查](https://github.com/Panda-995/KOLFlow/actions/runs/34574010915)：amd64、arm64 及多架构清单全部成功。两个原生架构容器均通过健康接口、空数据库账号状态、首页、图标及隐私政策资源检查。
- GHCR 与 Docker Hub 的 v1.4.2 均包含 Linux amd64 / arm64，对应摘要一致：amd64 `sha256:4b0eb0ccd51c3069985150d6a1c1dfc03b1e7e1d4c71a95bd0f0b536716d69f0`；arm64 `sha256:6e71286157a0ff3836d1012c72c1904213d9bceff2f36d1b9b6c1c071032f60b`。
- [Android 构建](https://github.com/Panda-995/KOLFlow/actions/runs/34573563007)：成功。下载的 APK 校验和、包名 `com.kolflow.app`、版本 `1.4.2` / versionCode `9`、minSdk `22`、targetSdk `36` 均核验通过。
- APK 证书 SHA256 为 `1372e14bf045bcfd156698b574912a89a9c6df15b82b1379b5d7cca2a0df27fa`，与旧版一致；APK 内图标和六张详情素材与原图一致。
- [绿联双架构打包](https://github.com/Panda-995/KOLFlow/actions/runs/34574159784)：成功。下载两份 `1.4.2.0011` UPK 后逐层读取 UPK / UGB / Docker 镜像，核验应用 ID、版本、架构、数据挂载和图标，全部通过。
- 两份最终安装包中的 INVITE_CODE 中文说明均为“请自定义6-64位邀请码，新用户注册 KOLFlow 账号时必须填写此邀请码。”；miniLength=6、maxLength=64、必填及可修改属性保持不变。
- 每个架构镜像中 public / dist 共 14 份图标与详情资源均与原文件一致。上架素材 ZIP 的所有文件及内部校验清单通过；说明文本一致（仅平台换行符差异）。
- 两份 UPK、APK 和素材 ZIP 均已完整下载，SHA256 与 GitHub 附件摘要及构建清单一致。Release 提供总校验清单及本报告副本。
