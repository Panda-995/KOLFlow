# v1.4.6 发布验证报告

2026-09-24，Windows / Node.js 22 / 本地无头 Chrome。

## 修复与证据

侧边栏切换时，React 将加载卡片和内容容器视为同一元素，duration-500 导致旧卡片的边框、背景及阴影过渡到正式页面。修复前逐帧测试捕获到 2px/1px 边框及卡片阴影；为加载、错误、正式内容赋予独立 key 后，商单、账单、待办、品牌和统计五页在桌面/手机切换的每个采样帧均无外框残留。未修改全局焦点样式。

## 本地验证

- 91/91 单元、业务与 API 测试通过。
- 25/25 Playwright 端到端测试通过，包括注册认证、商单与模板、品牌、账单、资产、任务日程、统计、日志、设置、备份、账号隔离、失败重试、弹窗、手机布局及素材。
- 新增桌面与移动端切换逐帧检查，以及全部九个入口、折叠菜单、Tab/Enter 和可见键盘焦点检查。
- TypeScript、ESLint、前端与服务端构建通过。
- 以 v1.4.5 数据库代码创建 12 表历史样本，再由新版本打开；逐表全部记录、字段、SQL schema 完全相同，integrity_check=ok，外键无错误。

## 兼容范围

本次不修改生产数据库模块、API、持久化路径或备份格式，仍使用 v4 导出并支持 v2/v3 导入。Android 保留应用 ID 和历史签名，versionCode 增为 13；UGOS Pro 为 1.4.6.0015，保留中英文邀请码说明、可选自定义数据目录和原目录回退。

## 验证边界

测试使用隔离数据，不操作用户实际数据库。没有 NAS 或 Android 真机，不能据此声明所有硬件环境和第三方服务均已实测。云端构建及产物检查见下文。

## 云端验证

- [CI](https://github.com/Panda-995/KOLFlow/actions/runs/35892367468)：91 项业务/API 测试、25 项 Linux Chromium E2E、类型检查与 ESLint 全部通过。main 的 PR 专用 Docker 检查按配置跳过，正式双架构检查在下述发布工作流执行。
- [Docker](https://github.com/Panda-995/KOLFlow/actions/runs/35892367429)：原生 amd64、arm64 均通过启动、v1.4.5 旧库 12 表逐项检查、原目录及复制到中文/空格目录、混合属主与重启持久化；加密注册/登录、鉴权及完整周报通过。首次合并任务在 Docker Hub 登录时出现临时 401，仅重跑失败任务后整个工作流成功。
- 匿名读取 GHCR、Docker Hub 的 1.4.6 / latest 清单，均有 linux/amd64 与 linux/arm64，四份清单对应摘要完全一致。
  - amd64: `sha256:66a0d88a76908aea9b76ce3b09c42fd94b4e988622f674fc3f8ef68ee1cbc26f`
  - arm64: `sha256:559db2891f4439d61788e994e79eb24653cb1ebfbff96e752f05d3be5f92e58f`

## Android

[构建](https://github.com/Panda-995/KOLFlow/actions/runs/35892373048)通过。下载 APK 后 apksigner 校验通过，aapt 确认包名 com.kolflow.app、versionName 1.4.6、versionCode 13、minSdk 22、targetSdk 36，无 debuggable 标记。签名证书 SHA256 为 `1372e14bf045bcfd156698b574912a89a9c6df15b82b1379b5d7cca2a0df27fa`，与旧版一致。

## UGOS Pro 打包

[最终构建](https://github.com/Panda-995/KOLFlow/actions/runs/35894221664)成功，生成 amd64 / arm64 的 1.4.6.0015 UPK、素材 ZIP 和校验文件。应用源码固定为 v1.4.6 标签。

原任务下载 ugcli 时连接被远端重置，重试持续停留在下载步骤后停止。随后从同一绿联下载地址直接取得 ugcli 1.1.0.13，通过临时草稿附件传给构建机；执行前验证 SHA256 `c455dd38def630db2566ae32d0850230ee89abbc948bd1df4819364e88b77713`。临时工具附件已删除。工作流增加下载超时、有限重试、固定摘要验证和可选缓存恢复入口。

生成配置的六组目录模板检查通过：参数缺失、空数组、空值、普通路径、中文空格路径、含引号/井号/冒号路径；每种情况仅生成一个正确的数据挂载。中英文邀请码说明和可选目录选择器检查通过。

## 下载产物独立检查

两个 UPK 已完整下载并核对 GitHub 记录的大小和 SHA256。解包确认应用 ID com.panda.kolflow、版本 1.4.6.0015、对应 CPU 架构及固定镜像 1.4.6；中文描述超过 100 字且与项目上架描述相同。分别从实际 UPK 提取配置运行六组目录映射检查，中英文邀请码说明、6–64 位规则和可选数据目录全部通过。包内图标、三张 PC 详情图、三张移动详情图逐字节匹配原文件。

APK 的图标及六张详情图匹配原文件；素材 ZIP 的图片和上架说明匹配，内部 SHA256SUMS-ASSETS 通过；构建产出的 SHA256SUMS-UPK 与 APK 校验文件均通过。最终 Release 包含两份 UPK、一份 APK、素材 ZIP、验证报告及三份校验清单，共八项附件。工具缓存不包含在最终附件中。
