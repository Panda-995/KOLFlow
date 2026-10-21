# KOLFlow 绿联应用中心上架信息

- 应用名称：KOLFlow
- 应用 ID：`com.panda.kolflow`
- 当前版本：`1.4.9.0018`
- 分类：实用工具
- 支持架构：amd64、arm64
- 开发者：熊猫不是猫QAQ
- 发布者：熊猫不是猫QAQ
- 发布者主页：https://github.com/Panda-995
- 官方网站：https://kolflow.hicp.fun/
- 帮助文档：https://post.smzdm.com/p/a6zg63m0/
- 源码链接：https://github.com/Panda-995/KOLFlow
- 许可协议：https://github.com/Panda-995/KOLFlow/blob/main/LICENSE
- 隐私政策：https://github.com/Panda-995/KOLFlow/blob/main/public/privacy-policy.html
- 问题反馈：https://github.com/Panda-995/KOLFlow/issues
- Android APP：https://github.com/Panda-995/KOLFlow/releases/latest

## 中文描述

KOLFlow 是面向内容创作者和达人的自托管商单管理套件，可部署在个人服务器或 NAS 上，通过电脑浏览器、手机浏览器和 Android 客户端访问。套件支持记录商单信息、合作类型、交付日期与执行状态，使用模板创建重复商单，管理品牌联系人、待办日历、发布链接和付费推广费用；可跟踪账单结算、置换商品及资产出售情况，并通过仪表盘、数据统计和周期通知查看业务进展。支持操作日志、数据导入导出和备份恢复，便于整理合作记录与维护历史数据。请勿让应用的 Docker 配置版 与绿联应用中心版同时读写同一数据库目录。Android 客户端需连接用户自行部署的服务。本项目独立开发，采用 GNU AGPL v3.0 开源，与所提及的第三方品牌不存在隶属或合作关系。

## English Description

KOLFlow is an independently developed, self-hosted collaboration manager for content creators. Deploy it on a personal server or NAS and access it through desktop and mobile browsers or an Android client connected to your server. Track orders, delivery dates and progress; reuse order templates; manage brand contacts, tasks, calendars, publication links and paid promotion costs. Record bill settlements, exchanged products and asset sales, and review dashboards, statistics, periodic notifications and activity logs. Data import, export and backup restoration help maintain historical records. Never let the Docker Compose deployment and the UGOS Pro App Center installation read and write the same database folder at the same time. Licensed under GNU AGPL v3.0. The project is not affiliated with or partnered with the third-party brands mentioned.

## 更新说明

- 商单新增「费用+产品」，可同时填写合作费用与多件赠送产品；模板同步支持，完成后生成费用账单及逐件资产。
- 资产库支持每件产品最多9张图片，可批量上传、预览和删除；关于项目显示当前版本。
- 升级只新增可空字段并保留旧数据，兼容旧版单产品、单图及 v2/v3/v4 备份。回退旧程序请使用升级前备份。
- 请勿让应用的 Docker 配置版 与绿联应用中心版同时读写同一数据库目录。
- Web / Docker / Android 为 1.4.9，Android versionCode 16，UGOS Pro 为 1.4.9.0018；应用 ID 与 Android 签名保持兼容。

## Update Notes

- Add fee plus products collaborations and multiple gifted products in orders and templates, generating separate bills and per-product assets on completion.
- Support up to nine images per asset, batch upload, preview and deletion. Display the build version in About.
- Add nullable database fields while retaining historical data and support for legacy single-product, single-image and v2/v3/v4 backups. Use a pre-upgrade backup when reverting to older software.
- Never let the Docker Compose deployment and the UGOS Pro App Center installation read and write the same database folder at the same time.
- Web / Docker / Android are version 1.4.9 (Android versionCode 16); UGOS Pro is 1.4.9.0018. The app ID and Android signing certificate remain compatible.

## 上架素材

原图保存在 `public/store-listing/pc` 和 `public/store-listing/mobile`，随 Docker 镜像包含在双架构 UPK 内。Release 同时提供 `KOLFlow-v1.4.9-ugreen-store-assets.zip`，包含图标、六张详情图、本说明和素材校验清单，供应用中心提交使用。详情图仍需在上架时提交，UPK 内包含图片不会自动更新应用中心展示。
