# KOLFlow 绿联应用中心上架信息

- 应用名称：KOLFlow
- 应用 ID：`com.panda.kolflow`
- 当前版本：`1.3.0.0004`
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

KOLFlow 是面向 KOL、内容创作者与达人团队的自托管商单管理系统，可集中管理商单进度、品牌与联系人、账单结算、置换资产、待办日历、发布链接、付费推广成本、数据统计、操作日志以及数据导入导出，并支持 Android 客户端连接。当前版本补充应用内隐私政策、个人信息“双清单”、投诉举报与账号注销入口，并要求 Android 客户端通过 HTTPS 连接服务端，适合在绿联 NAS 上长期运行。项目采用 GNU AGPL v3.0 开源，源码、许可协议、隐私政策、问题反馈和 APP 下载入口可通过上述链接查看。

## English Description

KOLFlow is a self-hosted business collaboration manager designed for creators and KOL teams. It centralizes orders, brands, contacts, billing, product assets, todos, publishing links, paid promotion costs, analytics, activity logs, data import and export, and Android client access. This update adds in-app privacy and personal-information lists, complaint/reporting and account-deletion paths, and HTTPS-only Android server connections. The project is open source under GNU AGPL v3.0, with source code, license, privacy, support, and APP download links listed above.

## 更新说明

- 应用“关于”页新增隐私政策、个人信息“双清单”、投诉举报、隐私负责人邮箱和 Android APP 下载入口。
- “账号安全”新增永久注销账号途径，要求当前密码及二次确认，并删除账号全部关联数据。
- 隐私政策按业务功能逐项说明收集目的、方式、范围和必要性，并补充运营者基本情况。
- Android 客户端关闭 HTTP 明文传输，仅允许连接具有有效证书的 HTTPS 服务地址。
- 重新构建 amd64、arm64 镜像、多架构 latest 清单及 UGOS Pro `1.3.0.0004` 双架构应用包。
- 登录与注册必须确认隐私政策，前端和服务端双重校验。
- 登录与注册失败限流调整为 15 分钟最多 60 次，成功请求不计数。
- 资产库列表不再一次性传输全部原图，图片进入可视区域后按需加载。
- 新上传资产图片自动缩放并压缩为 WebP。
- 项目许可证更新为 GNU AGPL v3.0，作者名称统一为“熊猫不是猫QAQ”。
- 修复依赖安全漏洞，构建时 `npm audit` 为 0 vulnerabilities。
