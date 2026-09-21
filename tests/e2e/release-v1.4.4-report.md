# KOLFlow v1.4.4 发布验证

验证日期：2026-09-21。

## 源码与变更

- 发布源码 / 标签：`d8b52e804ae8b1283282a84100b47a2c9ce69697` / `v1.4.4`。
- 后续工作流修复：`7fdbb39`，Android SDK 安装显式使用 `platform-tools`，避开已不可用的旧 `tools` 包。重跑工作流仍检出 `v1.4.4` 的应用源码。
- 周报改为上一完整周，月报改为上一完整月，按北京时间切换；修正通知标题、实际周期已读标识、跨周期刷新和统计图标签。
- 升级 multer 2.4.0、csv-parse 7.0.2、xmldom 0.9.12、qs 6.16.0；未发现本次发布的阻断问题。
- 应用 ID、数据库结构、备份格式与 Android 签名沿用旧版本。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| 回归测试 | 32/32 通过，包含真实 CSV 上传、中文/引号/金额/日期保留 |
| 周期边界 | 周一、周中、跨年、月初、闰年；报告套件另在 UTC 环境运行 13/13 通过 |
| Playwright | 3/3 通过，包含报告日期与统计链接、商单/导入兼容、桌面和移动素材 |
| TypeScript / 前端 / 服务端构建 | 全部通过 |
| npm audit（官方 registry，含开发依赖） | 0 个已知漏洞 |
| 隔离生产服务 | 加密注册/登录、未认证 API 拒绝访问、上周报告数据、重启保留通过 |
| 文件解析补验 | XLSX 中文导入、异常 multipart 拒绝处理及服务存活通过 |
| 工作流与提交 | YAML 解析、差异格式检查、提交令牌特征扫描通过 |

## GitHub Actions

| 工作流 | 结果 |
| --- | --- |
| [Docker 双架构构建及合并](https://github.com/Panda-995/KOLFlow/actions/runs/35552594875) | 成功 |
| [Android APK](https://github.com/Panda-995/KOLFlow/actions/runs/35552658157) | 成功 |
| [UGOS Pro 双架构 UPK](https://github.com/Panda-995/KOLFlow/actions/runs/35552830845) | 成功 |

amd64、arm64 均在原生 runner 上完成镜像构建、生产启动与静态资源检查；从 1.4.3 保留全部表记录和结构，验证原目录及中文/空格自定义目录、重启、写入、SQLite 完整性和外键。两种架构均使用实际 docker-compose.yml 完成加密认证、受保护 API、周报汇总及重启数据保留检查。

## 镜像公开验证

以下四个引用均通过不携带 GitHub 凭据的匿名 registry 查询，包含且仅包含 `linux/amd64` 和 `linux/arm64`：

- `ghcr.io/panda-995/kolflow:1.4.4`
- `ghcr.io/panda-995/kolflow:latest`
- `panda995/kolflow:1.4.4`
- `panda995/kolflow:latest`

共同 manifest digest：`sha256:89402a2b14c78927a24629d3bfb46289c5d8af5b7710f65c094927d83a79b76c`。

## Android 与资源

完整下载 APK 后使用 aapt / apksigner 独立验证：

- 包名 `com.kolflow.app`，versionName `1.4.4`，versionCode `11`。
- minSdk 22，targetSdk 36，APK v1/v2 签名验证通过。
- 签名证书 SHA-256：`1372e14bf045bcfd156698b574912a89a9c6df15b82b1379b5d7cca2a0df27fa`，与旧版本相同。
- APK SHA-256：`50d3bbe94a865305b04305b7c1a3607a669af32b424d29888c78577b7cd9c18a`，匹配流水线清单和 GitHub 资产摘要。

UPK 构建版本 `1.4.4.0013`，CI 检查源镜像架构、版本、中英文安装参数和目录映射。缺省参数、空选项、空值、普通路径、中文/空格及 YAML 特殊字符六种情况均只有一个正确的数据挂载。GitHub 返回的两个 UPK 资产摘要均与下载后的 `SHA256SUMS-UPK` 一致：

- amd64：`44eb0b8c61946b7e7948e83a8e954bfce881dcd2a43466d8f2ff4072035f06fc`
- arm64：`7d2dcfd6bc8178ce40d10b460cf67209cc6fa081d10a8ffe4e7fd39313c481c4`

商店 ZIP 完整下载校验通过，内含图标、六张详情图、当前上架说明及内部校验清单；内部各文件 SHA-256 校验通过，图标和说明与源码相符。

## 验证范围

这是源码、自动化浏览器、原生容器和发布资产验证，不等同于 NAS / Android 真机测试。Android 沿用历史 debug 签名分发方式。UPK 本地完整下载受网络影响未完成，UPK 内容依据 CI 打包和参数校验结果，下载完整性依据 GitHub 资产摘要与构建校验清单比对；未声称完成本地 UPK 全量解包。原生容器的升级和持久化已在两种架构通过。通知在应用内加载，关闭应用时不发送系统推送。
