# KOLFlow 绿联应用中心上架信息

- 应用名称：KOLFlow
- 应用 ID：`com.panda.kolflow`
- 当前版本：`1.4.0.0009`
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

KOLFlow 是面向 KOL、内容创作者与达人团队的自托管商单管理系统，可集中管理商单进度、品牌与联系人、账单结算、置换资产、待办日历、发布链接、付费推广成本、数据统计、操作日志以及数据导入导出，并支持 Android 客户端连接。1.4.0 修复每周数据通知无实际数据的问题，并新增可一键创建重复商单的商单模板；HTTP 认证载荷加密与最大 100 MB 的完整备份导入能力保持兼容。项目采用 GNU AGPL v3.0 开源。

## English Description

KOLFlow is a self-hosted business collaboration manager designed for creators and KOL teams. Version 1.4.0 restores real data in weekly notifications and adds reusable order templates for one-click creation of recurring collaborations. HTTP authentication payload encryption and full-backup import up to 100 MB remain supported. The project is open source under GNU AGPL v3.0.

## 更新说明

- 修复每周数据通知只有通知框架、没有实际数据内容的问题。
- 新增商单模板，可保存常用商单字段并一键创建重复商单。
- 重新构建 amd64、arm64 镜像、`1.4.0` 多架构清单及 UGOS Pro `1.4.0.0009` 双架构应用包。
- 应用“关于”页新增隐私政策、个人信息“双清单”、投诉举报、隐私负责人邮箱和 Android APP 下载入口。
- “账号安全”新增永久注销账号途径，要求当前密码及二次确认，并删除账号全部关联数据。
- 隐私政策按业务功能逐项说明收集目的、方式、范围和必要性，并补充运营者基本情况。
- 恢复 HTTP 页面、注册、登录和全部业务功能，不再强制切换 HTTPS。
- 登录、注册、修改邮箱/密码及账号注销载荷使用 RSA-OAEP-256 与 AES-256-GCM 混合加密。
- 请求体不再出现邮箱、密码或邀请码明文，并通过一次性挑战值阻止密文重放。
- Android 客户端恢复 HTTP 服务地址连接，并在 HTTP 下使用加密认证载荷完成注册、登录和账号安全操作。
- 完整备份预检与导入的 JSON 请求体上限提升至 `100 MB`，普通 JSON API 继续保持 `10 MB` 上限。
- 登录与注册必须确认隐私政策，前端和服务端双重校验。
- 登录与注册失败限流调整为 15 分钟最多 60 次，成功请求不计数。
- 资产库列表不再一次性传输全部原图，图片进入可视区域后按需加载。
- 新上传资产图片自动缩放并压缩为 WebP。
- 项目许可证更新为 GNU AGPL v3.0，作者名称统一为“熊猫不是猫QAQ”。
- 修复依赖安全漏洞，构建时 `npm audit` 为 0 vulnerabilities。
