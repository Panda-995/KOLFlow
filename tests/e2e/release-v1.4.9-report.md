# KOLFlow v1.4.9 发布验证报告

## 执行概览

2026-10-22，Windows 本地生产构建，Chrome/Playwright local 模式，独立测试数据库。类型检查、ESLint、前后端构建通过；99 项单元/接口回归、27 项端到端测试通过。用例计划见 `release-v1.4.9-plan.md`。

## 测试范围

- PRODUCTS-01、TEMPLATES-01：费用+产品与多产品创建、编辑、移除、完成、模板实例化；小数金额汇总；逐件资产与独立费用账单；产品重排及重复保存保持资产标识。
- IMAGES-01：批量上传、压缩、预览、逐张删除、封面切换、刷新持久化；每件最多9张、单张文件5MB、图片文本总量9MB；列表不携带图片，缩略图接口只返回封面。
- ABOUT-01：版本号来自 package.json 构建注入；1440×1000 和390×844的表单与图片管理截图检查通过，修正手机上合作类型文字截断。
- DATA-01、DATA-02：旧单产品及单图资产、旧模板、E卡面值、v2/v3/v4备份、新版完整备份恢复、失败导入保护、跨账号隔离；出售资产与结算账单历史保留。旧版单图客户端不能静默覆盖多图资产。
- 既有端到端测试继续覆盖登录注册、仪表盘、商单详情、品牌、账单、待办日程、统计、备份提示、导航、表单会话与账号隔离。

## 旧数据升级

本地通过 Git 标签 v1.4.8 的真实数据库初始化代码建立旧数据库，填入全部12张业务表，再运行新版初始化两次。逐表比较原字段定义与全部历史值，确认无修改；仅 orders.products、order_templates.products、assets.images、assets.orderProductId 四个可空TEXT字段新增。数据库完整性与外键检查通过。

备份版本仍为v4，支持旧版单产品和单图回退读取。新版多产品/多图备份应在新版恢复；如需回退旧程序，请使用升级前备份。应用ID、Android包名和默认数据目录保持不变。

## 归因与修复

- 首次并行构建时公开认证限流测试子服务启动超时；单独复现通过，后续完整99项回归通过，未修改限流业务逻辑。
- 新E2E脚本使用了错误的按钮名称，并直接导入JSON触发Node模块属性要求；按源码修正定位并改为读取package.json，重跑通过。
- 新历史保护用例未提供账单所需品牌字段，补齐测试数据后通过。

## 证据与验证边界

本地输出位于 `test-results/v1.4.9-unit.log`、`test-results/v1.4.9-e2e.log`、`test-results/e2e-report/` 和 `test-results/v1.4.9-*.png`。未在实体Android设备或用户NAS上实测；以下容器验证使用CI原生架构及合成数据目录。

## GitHub构建与发布资源核验

发布源代码及标签 `v1.4.9` 对应提交 `7757d7adad68ba46df6d5f6a1c9a8f78ac59b24f`。

- [GitHub CI](https://github.com/Panda-995/KOLFlow/actions/runs/39637133660) 成功：Linux下99项回归和27项端到端测试通过。
- [双架构镜像发布](https://github.com/Panda-995/KOLFlow/actions/runs/39637133525) 成功：amd64、arm64均完成原生首启、v1.4.8旧数据逐表升级比较、原目录/复制后的自定义目录、数据库完整性、权限回退、UID 2000、重启持久化、Compose加密登录、受保护接口及周期报告验证。
- GHCR与Docker Hub的 `1.4.9`、`latest` 均提供相同双架构清单 `sha256:86814d3f98bd9ca079df8cd1c902b9dd87192e0e55020897450c0435616eb3a1`。amd64为 `sha256:63d6c7228c041bb7fb8752fe1a6f836a8773b153dcbdb7780769f9d0e0c13f9f`，arm64为 `sha256:32765c6ef1d2bd875273f3bfd012333fd5d6745cf96f8effbc28ee9b0d91ccf8`；两仓库逐架构配置及层摘要相同。
- [Android APK](https://github.com/Panda-995/KOLFlow/actions/runs/39637187067) 构建成功并上传Release。下载核对包名 `com.kolflow.app`、versionCode `16`、versionName `1.4.9` 和APK v1/v2签名。证书SHA-256为 `1372e14bf045bcfd156698b574912a89a9c6df15b82b1379b5d7cca2a0df27fa`，与已有升级链一致；APK文件摘要为 `4deae0604e18a82186f93b20c39026d3335bc73bb688410ca8d09fedc935ff80`。包内WebView资源包含本次所有新增功能和版本显示。
- [绿联UPK](https://github.com/Panda-995/KOLFlow/actions/runs/39638197300) 构建成功并上传Release。下载的amd64/arm64 `1.4.9.0018` UPK与GitHub文件摘要和 `SHA256SUMS-UPK` 一致；解包核对应用ID、版本、架构、图标、中英文内容、安装目录映射和内置镜像配置，确认匹配最终发布镜像。工作流还验证安装模板渲染。素材ZIP内全部文件通过内置SHA-256校验。
- 首次UPK工作流因GitHub runner无法连接官方工具下载站超时。随后在本地直连官方站点取得相同工具，核对官方固定SHA-256 `c455dd38def630db2566ae32d0850230ee89abbc948bd1df4819364e88b77713`，通过现有缓存入口成功重跑；临时工具从正式Release移除。

Release包含安卓APK及校验、两种架构UPK及校验、应用中心素材ZIP、此验证报告和总校验清单。
