# KOLFlow v1.4.7 发布验证报告

## 问题与修复

用户报告 v1.4.6 绿联包持续重启，日志为 `SQLITE_CANTOPEN`，但同版镜像经普通 Docker Compose 可启动。镜像站 `latest` 与绿联包引用的 v1.4.6 镜像摘要相同，区别在所挂载的数据目录。旧入口在 NAS 挂载拒绝 `chown` 后仍无条件切换到 `node` 用户，导致该用户无法创建或写入 SQLite 文件。由于没有用户设备上的实际挂载路径和 ACL，本次无法确认其具体权限配置。

v1.4.7 启动入口先以将运行应用的身份实际探测数据目录、上传目录及已有 SQLite、WAL、SHM 文件的读写能力；若 `node` 不可写，会尝试数据目录所有者。绿联包允许在容器管理员可写的情况下回退到该身份；普通 Docker 默认仍以非管理员身份运行，也可显式启用同一回退。所有身份均不可写时以明确的目录权限错误退出，避免只留下 SQLite 堆栈。绿联包声明可在 UGOS Pro 应用设置中授权共享文件夹；默认 `./data` 以及安装时选择自定义目录的行为保持不变。

## 验证结果

- 主分支 CI [35945756444](https://github.com/Panda-995/KOLFlow/actions/runs/35945756444)：类型检查、ESLint、91 项单元及回归测试、前端构建和 25 项 Chromium 端到端测试通过，覆盖主要页面、导航、交互、历史数据和移动端布局。
- 发布镜像构建 [35945756463](https://github.com/Panda-995/KOLFlow/actions/runs/35945756463) 与预发布原生回归 [35945266654](https://github.com/Panda-995/KOLFlow/actions/runs/35945266654) 均成功。amd64、arm64 分别验证首启、旧账号/商单等全部表的行与结构、原目录与复制后的自定义目录、重启后的数据、Compose 登录与受保护接口。模拟禁止 `chown` 的 root 所有目录及 UID 2000 所有目录均成功读写旧 SQLite；完全无法写入时给出明确错误。宿主端口 3441 的 HTTP 首页与健康接口均通过。
- 匿名检查 GHCR 与 Docker Hub 的 `1.4.7` 和 `latest`：四个标签指向同一双架构清单 `sha256:33429d925f5382d816dcd8d394802a912971420c294803c5dbd1eb130f5885af`，其 amd64 子镜像为 `sha256:a9ce9c4c2986bcc460337f579d86f521cbce5c41a1ed30042be1c0de8987d4ef`，arm64 子镜像为 `sha256:c78b1e6ada8292814a3c1e75baf9ab5b4a6908efb330624830cf6851303fb390`。
- 绿联包构建 [35945897346](https://github.com/Panda-995/KOLFlow/actions/runs/35945897346) 成功。下载的 amd64/arm64 `1.4.7.0016` UPK 与 GitHub 摘要一致；解包核对应用 ID、版本、架构、双语上架描述和邀请码文案、共享目录授权标志、默认与自定义挂载、图标与六张详情素材；六种目录参数模板渲染均通过。
- Android 构建 [35945818751](https://github.com/Panda-995/KOLFlow/actions/runs/35945818751) 成功。Release APK 为 `com.kolflow.app`，`versionCode=14`、`versionName=1.4.7`；签名证书 SHA-256 为 `1372e14bf045bcfd156698b574912a89a9c6df15b82b1379b5d7cca2a0df27fa`，与既有升级链一致。APK 中图标与六张详情素材、素材 ZIP 内说明和校验文件均核对通过。

## 兼容性与限制

本次未更改数据库结构、应用 ID、Android 包名与签名、备份格式。旧版 SQLite 及业务数据在两种原生架构的升级和重启测试中保持一致。自定义数据目录不会自动迁移旧文件；更换目录前应停止应用并复制完整数据库及 WAL/SHM 文件，或使用备份恢复。普通 Docker 与绿联包不要同时写同一数据库目录。

以上是 CI、合成目录及构建产物的验证结果，尚未在用户的实体 UGOS Pro NAS 或 Android 真机上实测。若实际 NAS 共享目录对容器所有身份均拒绝写入，仍需在 UGOS Pro 应用设置中授予该目录读写权限。
