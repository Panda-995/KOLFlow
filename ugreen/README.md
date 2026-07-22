# KOLFlow 绿联 UGOS Pro 应用包

此目录保存 KOLFlow 的绿联 UGOS Pro 打包配置，支持 `amd64` 与 `arm64`。应用包基于项目公开的多架构 Docker 镜像制作，应用 ID 保持为 `com.panda.kolflow`，当前版本为 `1.3.0`。

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

## HTTP 与敏感信息保护

KOLFlow 保留 UGOS Pro 的 HTTP 与 HTTPS 访问方式。`1.3.0.0007` 起，HTTP 下可正常注册、登录和使用全部功能；登录、注册、修改邮箱/密码及账号注销的敏感载荷使用 RSA-OAEP-256 与 AES-256-GCM 混合加密，请求体不再出现邮箱、密码或邀请码明文。HTTPS 仍是推荐方式，用于抵御 HTTP 页面被主动中间人篡改。

## 构建方式

在 GitHub Actions 中手动运行 `Build UGOS Pro UPK` 工作流。工作流会分别拉取 amd64、arm64 镜像，使用绿联官方 `ugcli` 校验项目并生成两个 UPK 安装包，同时生成 `SHA256SUMS`。

本地生成的镜像归档和 UPK 文件属于构建产物，不提交到 Git 仓库。
