# KOLFlow v1.4.8 发布验证报告

## 本次更新

绿联应用中心的中英文上架描述、更新说明和安装目录提示加入数据库目录使用提醒。中文原文为：**请勿让应用的 Docker 配置版 与绿联应用中心版同时读写同一数据库目录。** 切换部署方式时，应先停止原实例，再迁移完整数据目录（包括 SQLite 的 WAL/SHM 文件）或恢复备份。

登录/注册页的用户状态与加密公钥接口此前共用每分钟 60 次的限流额度。端到端测试重现该额度耗尽时页面误报无法连接；本版将两条接口分别限流，保留各自的每分钟 60 次上限，避免正常页面请求相互挤占额度。

## 验证结果

- 本地 `npm run lint:all`、`npm test`（92 项）、`npm run build:server`、`npm run test:e2e`（Chromium 25 项）通过。主分支 [CI](https://github.com/Panda-995/KOLFlow/actions/runs/38689640925) 的检查与端到端测试通过。新增限流回归测试分别请求两个公开认证接口，确认一个接口达到限额后不会耗尽另一接口的额度。
- [预发布原生容器验证](https://github.com/Panda-995/KOLFlow/actions/runs/38689092010) 与[主分支镜像发布](https://github.com/Panda-995/KOLFlow/actions/runs/38689640929) 均通过。amd64、arm64 分别检查镜像首启、v1.4.7 旧数据升级、全部业务表行与结构、原目录和复制后的自定义目录、读写权限、重启持久化、Compose 登录与受保护接口。对禁止 `chown` 的 root 所有目录和 UID 2000 所有目录进行了模拟验证；完全不可写时会给出明确错误。
- GHCR、Docker Hub 的 `1.4.8` 与 `latest`，以及 `ghcr.linkos.org/panda-995/kolflow:latest`，均提供相同的 amd64/arm64 镜像清单 `sha256:22f1f21b0496ef1ae40db41cc54df02417ea630d8fcd4d1e94bc05b5637ca2dc`。amd64 子镜像为 `sha256:2d62ba549dcdf06214550c09a0137890a92af054e8baede3aecc7cb6b2a014d8`，arm64 为 `sha256:2135717a5dce61aeefcc27c64ff718b2e1759304c9638dcf41c713ae79bf87ad`；镜像站逐架构配置与层摘要亦与 GHCR 一致。
- [绿联 UPK 最终构建](https://github.com/Panda-995/KOLFlow/actions/runs/38690263716) 通过，在主分支镜像清单合并后重新打包。下载的 amd64/arm64 `1.4.8.0017` UPK 均与 GitHub SHA-256 摘要一致；解包核对应用 ID、版本、架构、中英文上架描述、安装目录参数、默认与自定义映射、邀请码配置、图标及六张详情图，并核对内置镜像配置与最终发布镜像一致。构建流水线还验证了安装模板渲染。
- [Android APK 构建](https://github.com/Panda-995/KOLFlow/actions/runs/38689680031) 通过。APK 为 `com.kolflow.app`，`versionCode=15`、`versionName=1.4.8`；签名证书 SHA-256 为 `1372e14bf045bcfd156698b574912a89a9c6df15b82b1379b5d7cca2a0df27fa`，与既有升级链一致。APK 图标、六张详情图、应用中心素材 ZIP 和构建生成的校验文件已核对。

## 兼容性与验证边界

本版未更改数据库结构、备份格式、应用 ID、Android 包名与签名，以及默认数据目录。v1.4.7 SQLite 业务数据在两种原生架构的升级与重启测试中保持一致。更换数据目录不会自动迁移旧文件；同一数据库目录不可由 Docker 配置版与绿联应用中心版同时读写。

以上验证使用 CI 原生架构、合成数据目录和构建产物；尚未在用户的实体 UGOS Pro NAS 或 Android 真机上实测。实际 NAS 目录仍需在 UGOS Pro 应用设置中授予读写权限。
