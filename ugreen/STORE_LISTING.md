# KOLFlow 绿联应用中心上架信息

- 应用名称：KOLFlow
- 应用 ID：`com.panda.kolflow`
- 当前版本：`1.3.0.2`
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

## 中文描述

KOLFlow 是面向 KOL、内容创作者与达人团队的自托管商单管理系统，可集中管理商单进度、品牌与联系人、账单结算、置换资产、待办日历、发布链接、付费推广成本、数据统计、操作日志以及数据导入导出，并支持 Android 客户端连接。当前版本加入登录与注册隐私政策确认、资产图片按需加载和自动压缩，适合在绿联 NAS 上长期运行。项目采用 GNU AGPL v3.0 开源，源码、许可协议与隐私政策可通过上述链接查看。

## English Description

KOLFlow is a self-hosted business collaboration manager designed for creators and KOL teams. It centralizes orders, brands, contacts, billing, product assets, todos, publishing links, paid promotion costs, analytics, activity logs, data import and export, and Android client access. Version 1.3.0 adds mandatory privacy consent for authentication, on-demand image loading, and automatic image compression for smoother NAS and mobile use. The project is open source under GNU AGPL v3.0, with source code, license, privacy policy, help documentation, and issue reporting links listed above.

## 更新说明

- 登录与注册必须确认隐私政策，前端和服务端双重校验。
- 登录与注册失败限流调整为 15 分钟最多 60 次，成功请求不计数。
- 资产库列表不再一次性传输全部原图，图片进入可视区域后按需加载。
- 新上传资产图片自动缩放并压缩为 WebP。
- 项目许可证更新为 GNU AGPL v3.0，作者名称统一为“熊猫不是猫QAQ”。
- 修复依赖安全漏洞，构建时 `npm audit` 为 0 vulnerabilities。
