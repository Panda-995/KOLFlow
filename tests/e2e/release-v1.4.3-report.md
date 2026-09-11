# v1.4.3 发布验证报告

日期：2026-09-11。Web / Docker / Android 1.4.3，Android versionCode 10，UGOS Pro 1.4.3.0012。

## 修改与兼容性

同步修正英文邀请码说明；新增安装时可选、安装后可修改的数据文件夹参数。UGOS Pro 的 Go 模板在缺少参数、空列表及空值时保留原 `./data:/app/data`，在选择目录时使用唯一的自定义 bind mount。目录以 YAML 块标量表示，避免中文、空格、引号、井号和冒号影响 YAML 解析。中英文安装说明明确更换目录需要停用并复制文件，或恢复完整备份，不会自动搬迁数据。

应用 ID、业务代码、数据库结构、备份格式、容器内 `/app/data`、Android 包名与签名保持不变。依赖锁文件仅更新项目版本。

## 本地结果

| 检查 | 结果 |
| --- | --- |
| 类型检查、前端及生产服务端构建 | 通过 |
| 接口、业务、周期报告回归 | 22/22 通过 |
| Playwright 核心流程及 PC/移动素材 | 3/3 通过 |
| v1.4.2 历史数据原地升级 | 12 张表的所有合成记录及结构保留 |
| 将停用后的数据复制到含中文、空格的自选目录 | 12 张表的所有记录及结构保留 |
| SQLite 完整性及外键 | integrity_check=ok；foreign_key_check 无错误 |
| 安装参数及生成模板 | 六种缺省/自选目录场景均只有一个正确挂载；中英文说明与邀请码规则正确 |
| 打包配置与工作流语法 | ugcli check / 本地配置探测打包、YAML 和 Shell 语法通过 |

初次本地迁移用例使用 Node 的文件复制时，Windows 环境将中文目标路径写成乱码，导致验证读到另一个空目录。核实两个目录的内容后改用 Python 复制，并在独立进程加载业务数据库模块，结果通过。未因此修改应用数据库逻辑。云端还将使用 Linux 原生容器验证实际挂载与重启。

本地打包探测使用极小的测试镜像归档，只用于配置检查，不作为发布包。正式安装包必须从云端构建的完整镜像生成并另行核验。

## 覆盖与边界

覆盖注册登录、HTTP 加密认证与防重放、账号安全、用户隔离、商单模板、品牌和关联记录、待办/账单/发布链接校验、资产出售、周期通知、备份 v2 导入与 v3 导出、导入容量、核心页面与素材加载。

使用隔离目录和合成数据，没有操作用户实际业务库。没有连接 NAS 或 Android 真机，不声称完成真机安装、交互或全部硬件环境验证。外部 WebDAV 服务未进行在线端到端测试。

## 证据

计划见 `tests/e2e/release-v1.4.3-plan.md`。新增可复跑验证为 `scripts/verify-ugreen-template.py`、`scripts/render-ugreen-template.go`、`scripts/verify-container-storage.sh`；本地原始日志和隔离升级脚本在 `.tmp-release-v1.4.3/`。正式构建和附件核验结果在发布前补充。

## 云端镜像及 Android 验证

- 源码标签 `v1.4.3` 对应提交 `fcdac36b537f8f579e01505c6bab6d78c8366a93`。
- [双架构镜像构建](https://github.com/Panda-995/KOLFlow/actions/runs/34599937102)成功：amd64 和 arm64 分别在原生架构上构建并启动，健康接口、空数据库状态和静态资源正常。
- 两个原生架构均通过旧版 v1.4.2 镜像生成历史账号和商单、新版从原目录启动、新版重启、停用后复制到含中文与空格的自选目录、再次启动与重启检查。12 张表快照、数据库结构、账号存在状态和文件夹可写性均正确，完整性及外键检查通过。每个架构检查原目录和新目录各两次。
- GHCR 和 Docker Hub 的 `1.4.3` 镜像均含 Linux amd64 / arm64，对应摘要一致。
  - amd64: `sha256:1d9d6b2232fd75cdabf83b14f18cea7429ab8a9e92cd051a2f0f9c074f27f8a4`
  - arm64: `sha256:1c46049e44115eac94a2125bf0c8cd8741e8cb935c4c8695556b9d7637619189`
- [Android 构建](https://github.com/Panda-995/KOLFlow/actions/runs/34599948692)成功。下载 APK 后核验包名 `com.kolflow.app`、版本 `1.4.3`、versionCode `10`、minSdk `22`、targetSdk `36`。
- APK v1/v2 签名校验通过，证书 SHA256 为 `1372e14bf045bcfd156698b574912a89a9c6df15b82b1379b5d7cca2a0df27fa`，与旧版一致。图标和六张详情素材与原图一致；构建校验文件和 GitHub 附件摘要一致。

## 正式 UPK、素材与附件验证

- [UGOS Pro 双架构打包](https://github.com/Panda-995/KOLFlow/actions/runs/34600193190)成功，使用完整发布镜像生成 `1.4.3.0012` 安装包。云端生成的 Go 模板通过六种目录输入的渲染与 YAML 检查。
- 下载两份正式 UPK 后逐层读取 UPK / UGB / Docker 镜像，核验应用 ID `com.panda.kolflow`、版本、架构、图标和超过 100 个汉字的中文功能描述，全部通过。
- 两份包中的英文邀请码说明均为“Please define your own 6-64 character invite code. New users must provide this code when registering.”；中文后半句、6–64 位规则、必填及可修改属性正确。
- 两份包均包含中英文数据文件夹选择项，类型为单选路径、可选且可修改。对各自实际 `docker-compose.tmpl` 执行 Go 渲染：缺少参数、空列表和空值保留 `./data`；普通目录、中文空格目录、带引号/井号/冒号的目录均准确挂载到 `/app/data`，没有重复或丢失挂载。
- 每份镜像的 public / dist 共 14 份图标及详情资源与源文件一致。上架素材 ZIP 的图标、六张详情图、新版说明和内部 SHA256 清单通过。
- 两份 UPK、APK、素材 ZIP 及构建校验文件完整下载，文件大小与 GitHub 附件 SHA256 摘要一致。Release 另提供本报告及总校验清单，共八个附件。
- 正式发布文件在本地 `.tmp-release-v1.4.3/downloads/`。配置探测阶段产生的测试 UPK 已移除，未上传 Release。

结论：本次自动化功能回归、旧数据兼容、双架构原生运行、最终安装包配置和 Android 签名检查通过；保留上述 NAS / Android 真机验证边界。
