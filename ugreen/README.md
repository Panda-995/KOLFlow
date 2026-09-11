# KOLFlow 绿联 UGOS Pro 应用包

此目录保存 KOLFlow 的绿联 UGOS Pro 打包配置，支持 `amd64` 与 `arm64`。应用包基于项目公开的多架构 Docker 镜像制作，应用 ID 保持为 `com.panda.kolflow`，当前版本为 `1.4.3`（构建号 `0012`）。

## 应用信息

- 开发者：熊猫不是猫QAQ
- 发布者：熊猫不是猫QAQ
- 源码：https://github.com/Panda-995/KOLFlow
- 帮助文档：https://post.smzdm.com/p/a6zg63m0/
- 许可协议：https://github.com/Panda-995/KOLFlow/blob/main/LICENSE
- 隐私政策：https://github.com/Panda-995/KOLFlow/blob/main/public/privacy-policy.html
- 问题反馈：https://github.com/Panda-995/KOLFlow/issues
- Android APP：https://github.com/Panda-995/KOLFlow/releases/latest

商店上架所需的中英文描述、版本说明和链接见 `STORE_LISTING.md`。

## 安装与数据文件夹

1. 从 Release 下载符合设备架构的 UPK，在 UGOS Pro 应用中心选择手动安装。
2. 在安装配置的“数据文件夹 / Data folder”中选择有读写权限的文件夹，数据库和业务数据会保存在此处。该选项可留空；留空继续使用应用原来的 `./data` 目录，兼容没有此参数的旧版配置。
3. 自定义 JWT 签名密钥及 6–64 位注册邀请码，完成安装。英文邀请码说明为“Please define your own 6-64 character invite code. New users must provide this code when registering.”。
4. 安装后可通过 UGOS Pro 的应用配置修改数据文件夹。一个数据目录只供一个 KOLFlow 实例使用。

升级时若继续使用原数据，请保持文件夹选项留空；若旧版已手动映射过目录，请选择相同的实际目录。不要选择空目录后直接开始新增业务数据。

更换目录前先导出完整备份并停用应用，把原数据目录的全部内容（包括可能存在的 `database.sqlite-wal`、`database.sqlite-shm`）复制到新目录，确认应用拥有读写权限，再修改文件夹配置并启动。也可以在新目录启动后通过 KOLFlow 导入完整备份；这会创建新的账号环境，需要按应用流程注册和恢复。文件夹选择仅改变挂载位置，不会自动搬迁旧文件。JWT 签名密钥保持不变。

### Installation and data folder

Install the UPK for your NAS architecture. In the installation wizard, use **Data folder** to select a writable folder for the database and business data, then set your JWT signing secret and registration invite code. Leave the folder blank to retain the original `./data` directory, including when upgrading an older installation without this setting. If you previously customized the mount manually, select that same directory.

To change folders, export a full backup, stop the app, copy the entire existing data directory (including any SQLite WAL/SHM files) to the new folder, and update the app configuration before restarting. Alternatively, initialize the new directory and restore a full backup through KOLFlow. Choosing a folder does not move existing files. Keep the JWT secret unchanged and do not share one database directory between app instances.

The Compose source contains Go template directives in YAML comments for UGOS Pro packaging. Use the UPK for this installation flow; for plain Docker deployments, use the repository's normal Compose file and set its host-side bind path.

## HTTP 与敏感信息保护

KOLFlow 保留 UGOS Pro 的 HTTP 与 HTTPS 访问方式。`1.3.0.0007` 起，HTTP 下可正常注册、登录和使用全部功能；登录、注册、修改邮箱/密码及账号注销的敏感载荷使用 RSA-OAEP-256 与 AES-256-GCM 混合加密，请求体不再出现邮箱、密码或邀请码明文。HTTPS 仍是推荐方式，用于抵御 HTTP 页面被主动中间人篡改。

## 数据导入容量

`1.3.0.0008` 将完整备份预检与导入接口的 JSON 请求体上限提升至 `100 MB`，其他 JSON API 继续保持 `10 MB` 上限。若通过自建反向代理访问 KOLFlow，请同时将代理层请求体上限配置为至少 `100 MB`。

## 构建方式

在 GitHub Actions 中手动运行 `Build UGOS Pro UPK` 工作流。工作流会分别拉取 `1.4.3-amd64`、`1.4.3-arm64` 不可变镜像，使用绿联官方 `ugcli` 校验项目并生成两个 UPK 安装包，同时生成 `SHA256SUMS-UPK`。

本地生成的镜像归档和 UPK 文件属于构建产物，不提交到 Git 仓库。

## 详情素材

PC 详情图（1854×1236）和移动端详情图（1125×2436）各三张，原图位于 `public/store-listing/`，随应用镜像进入 UPK。商店提交素材另见 Release 中的 `KOLFlow-v1.4.3-ugreen-store-assets.zip`。Docker UPK 的 `rootfs_common` 仅保留规范允许的图标和 Compose 文件。
