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

## HTTPS 访问要求

UGOS Pro 会为应用分配 HTTP 与 HTTPS 两个访问端口。KOLFlow 生产 API 默认拒绝明文 HTTP，Web 端也会在请求发出前阻止邮箱、密码、邀请码、令牌和业务数据通过 HTTP 传输。安装 `1.3.0.0006` 后，请从系统分配的 HTTPS 访问端口或 UGREENlink HTTPS 域名打开应用；旧的 `http://NAS-IP:3441` 地址只显示安全连接提示。

## 构建方式

在 GitHub Actions 中手动运行 `Build UGOS Pro UPK` 工作流。工作流会分别拉取 amd64、arm64 镜像，使用绿联官方 `ugcli` 校验项目并生成两个 UPK 安装包，同时生成 `SHA256SUMS`。

本地生成的镜像归档和 UPK 文件属于构建产物，不提交到 Git 仓库。
