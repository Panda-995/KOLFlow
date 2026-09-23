# KOLFlow 绿联应用中心上架信息

- 应用名称：KOLFlow
- 应用 ID：`com.panda.kolflow`
- 当前版本：`1.4.5.0014`
- 分类：实用工具
- 支持架构：amd64、arm64
- 开发者：熊猫不是猫QAQ
- 发布者：熊猫不是猫QAQ
- 发布者主页：https://github.com/Panda-995
- 帮助文档：https://post.smzdm.com/p/a6zg63m0/
- 源码链接：https://github.com/Panda-995/KOLFlow
- 许可协议：https://github.com/Panda-995/KOLFlow/blob/main/LICENSE
- 隐私政策：https://github.com/Panda-995/KOLFlow/blob/main/public/privacy-policy.html
- 问题反馈：https://github.com/Panda-995/KOLFlow/issues
- Android APP：https://github.com/Panda-995/KOLFlow/releases/latest

## 中文描述

KOLFlow 是面向内容创作者和达人的自托管商单管理套件，可部署在个人服务器或 NAS 上，通过电脑浏览器、手机浏览器和 Android 客户端访问。套件支持记录商单信息、合作类型、交付日期与执行状态，使用模板创建重复商单，管理品牌联系人、待办日历、发布链接和付费推广费用；可跟踪账单结算、置换商品及资产出售情况，并通过仪表盘、数据统计和周期通知查看业务进展。支持操作日志、数据导入导出和备份恢复，便于整理合作记录与维护历史数据。Android 客户端需连接用户自行部署的服务。本项目独立开发，采用 GNU AGPL v3.0 开源，与所提及的第三方品牌不存在隶属或合作关系。

## English Description

KOLFlow is an independently developed, self-hosted collaboration manager for content creators. Deploy it on a personal server or NAS and access it through desktop and mobile browsers or an Android client connected to your server. Track orders, delivery dates and progress; reuse order templates; manage brand contacts, tasks, calendars, publication links and paid promotion costs. Record bill settlements, exchanged products and asset sales, and review dashboards, statistics, periodic notifications and activity logs. Data import, export and backup restoration help maintain historical records. Licensed under GNU AGPL v3.0. The project is not affiliated with or partnered with the third-party brands mentioned.

## 更新说明

- 优化页面按需加载、列表分页、手机导航和弹窗操作，补充加载失败后的重试入口。
- 加强切换账号后的缓存隔离、密码修改后的会话撤销，以及商单、账单与品牌之间的数据关联。
- 改进完整备份及 WebDAV 同步，导出升级为 v4，继续支持旧版 v2/v3 备份导入；缺失的集合不再被误当成空集合清除。
- 容器服务改为非 root 用户运行，兼容旧版数据文件权限；安装时仍可选择数据目录，留空沿用原路径。
- Web / Docker / Android 版本为 1.4.5，Android versionCode 12，UGOS Pro 版本为 1.4.5.0014；应用 ID、已有数据和 Android 签名保持兼容。
- 升级前建议保留旧版完整备份。新版 v4 备份不应直接交给仅支持 v3 的旧程序恢复。

## 上架素材

原图保存在 `public/store-listing/pc` 和 `public/store-listing/mobile`，随 Docker 镜像包含在双架构 UPK 内。Release 同时提供 `KOLFlow-v1.4.5-ugreen-store-assets.zip`，包含图标、六张详情图、本说明和素材校验清单，供应用中心提交使用。详情图仍需在上架时提交，UPK 内包含图片不会自动更新应用中心展示。
