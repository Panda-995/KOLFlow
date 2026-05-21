# KOLFlow

<p align="center">
  <img src="public/github.png" alt="KOLFlow" width="800">
</p>

<p align="center">
  <strong>达人商单流管理系统</strong><br>
  <sub>KOL Business Collaboration Management System</sub>
</p>

<p align="center">
  <strong>轻松管理每一笔合作，让商单管理更高效</strong><br>
  <sub>Efficient business collaboration tracking for KOLs</sub>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#tutorial">Tutorial</a> •
  <a href="#android-app">Android App</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#api-docs">API Docs</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#-更新日志--changelog">Changelog</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js">
  <img src="https://img.shields.io/badge/React-19-blue.svg" alt="React">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
</p>

---

<a id="tutorial"></a>

## Tutorial | 使用教程

值得买详细教程：[KOLFlow 达人商单管理系统使用教程](https://post.smzdm.com/p/a6zg63m0/)

---

<a id="features"></a>

## Features | 功能特性

| Feature | 功能 |
|---------|------|
| 📊 Dashboard | 📊 仪表盘 |
| 📦 Order Management | 📦 商单管理 |
| ✅ Todo & Calendar | ✅ 待办/日历 |
| 💰 Billing | 💰 账单管理 |
| 🏢 Brand Management | 🏢 品牌管理 |
| 🎁 Asset Library | 🎁 资产库 |
| 📈 Analytics | 📈 数据统计 |
| 📋 Activity Logs | 📋 操作日志 |
| 🔐 API Key Management | 🔐 API Key 管理 |
| 🎨 Themes | 🎨 主题外观 |
| 📱 Android App | 📱 Android 客户端 |

### Data Linkage | 数据联动

| Action | 操作 | Effect | 效果 |
|--------|------|--------|------|
| Create Order | 创建商单 | Auto-create Todo | 自动创建待办 |
| Complete Order (Paid/Direct) | 商单完成（付费/直发） | Auto-create Bill | 自动创建账单 |
| Complete Order (Exchange) | 商单完成（置换） | Auto-create Asset | 自动创建资产 |
| Complete Order (E-card) | 商单完成（E卡） | Auto-create Asset with E-card label | 自动创建E卡资产 |
| Change Type: Paid → Exchange/E-card | 类型变更：付费 → 置换/E卡 | Delete Bill, create Asset if completed | 删除账单，完成时创建资产 |
| Change Type: Exchange/E-card → Paid | 类型变更：置换/E卡 → 付费 | Delete Asset, create Bill if completed | 删除资产，完成时创建账单 |
| Change Type: Exchange ↔ E-card | 类型变更：置换 ↔ E卡 | Update Asset name | 更新资产名称 |
| Delete Order | 删除商单 | Delete related Bill + Asset + Todo | 删除关联账单、资产、待办 |
| Delete Brand | 删除品牌 | Clear brand info | 品牌信息置空 |
| Mark Asset as Sold | 资产标记已出 | Update brand income, reflect in dashboard/analytics | 更新品牌收入，计入仪表盘和统计 |
| Complete All Todos | 待办全部完成 | Mark order complete | 关联商单标记完成 |

---

<a id="getting-started"></a>

## Getting Started | 快速开始

### Requirements | 环境要求

- **Node.js >= 20.19.0** or **>= 22.12.0**
- npm >= 9
- Android App build only | 仅构建 Android App 需要：
  - JDK 17+
  - Android Studio / Android SDK

> **Note**: Due to `@vitejs/plugin-react@5.x`, Node.js version must be >= 20.19.0.

### Installation | 安装

```bash
git clone https://github.com/Panda-995/KOLFlow.git
cd KOLFlow
npm install
```

### Configuration | 配置

Create `.env` file:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secret-key-here
INVITE_CODE=your-invite-code
CORS_ORIGIN=http://localhost:3000
DATA_DIR=./data
```

### Run | 运行

```bash
# Development | 开发模式
npm run dev

# Production | 生产构建
npm run build
NODE_ENV=production npx tsx server.ts
```

Windows PowerShell production example:

```powershell
npm run build
$env:NODE_ENV = "production"
npx tsx server.ts
```

The server listens on `0.0.0.0:3000`, so devices on the same LAN can access it through:

```text
http://<your-computer-lan-ip>:3000
```

### First Use | 首次使用

1. Visit http://localhost:3000
2. Click "注册账号" (Register)
3. Enter email, password, and invite code

---

<a id="android-app"></a>

## Android App | Android 客户端

KOLFlow provides a Capacitor-based Android app. The mobile app reuses the same backend and most of the same Web UI. On the login screen, the app asks for a server address first, then uses the account/password from that server to sign in.

### Server Address | 服务端地址

Use an address that the phone can actually reach:

| Device | 服务端地址示例 |
|--------|----------------|
| Android emulator | `http://10.0.2.2:3000` |
| Real Android phone on the same LAN | `http://192.168.x.x:3000` |

Do not use `localhost`, `127.0.0.1`, or `0.0.0.0` inside the app. On a real phone, `localhost` means the phone itself, not your computer.

### Build APK | 构建 APK

```bash
# Build web assets and sync native project
npm run cap:sync

# Build Android debug APK
cd android
./gradlew assembleDebug
```

Windows PowerShell example:

```powershell
npm run cap:sync
cd android
.\gradlew.bat assembleDebug
```

If Gradle reports that Java 8 is being used, set `JAVA_HOME` to a JDK 17+ installation before building.

The debug APK will be generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

### Release APK | 发布签名包

Release builds require a local signing keystore. Keep the keystore and passwords private, and do not commit them to Git.

```powershell
# Build web assets and sync native project
npm run cap:sync

# Build signed release APK
cd android
$env:JAVA_HOME="C:\tmp\temurin-jdk17\jdk-17.0.19+10"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat assembleRelease `
  "-Pandroid.injected.signing.store.file=G:/Agent/KOLFlow/android/app/kolflow-release.jks" `
  "-Pandroid.injected.signing.store.password=<storePassword>" `
  "-Pandroid.injected.signing.key.alias=kolflow" `
  "-Pandroid.injected.signing.key.password=<keyPassword>"
```

The release APK will be generated at:

```text
android/app/build/outputs/apk/release/app-release.apk
```

### Mobile Notes | 移动端说明

- App name: `KOLFlow`
- App icon source: `public/app.png`
- HTTP server access is enabled for LAN/private deployment scenarios.
- Native HTTP is enabled in Capacitor so Android requests and file imports work reliably with a configured backend address.

---

<a id="deployment"></a>

## Deployment | 部署

### Docker (Recommended) | Docker 部署（推荐）

支持多架构镜像：amd64 (x86_64) 和 arm64 (Apple Silicon, 树莓派等)

```bash
# 拉取并启动（自动选择对应架构）
docker-compose up -d

# 或手动指定镜像
docker run -d -p 3000:3000 \
  -e JWT_SECRET=your-secret \
  -e INVITE_CODE=your-code \
  ghcr.io/panda-995/kolflow:latest
```

**镜像标签**:

| Tag | 说明 |
|-----|------|
| `latest` | 最新版（多架构） |
| `arm` | ARM64 架构专用 |
| `arm64` | ARM64 架构专用 |
| `linux/amd64` | x86_64 架构 |

Set environment variables | 设置环境变量:
```bash
export JWT_SECRET=your-secret-key
export INVITE_CODE=your-invite-code
docker-compose up -d
```

---

<a id="api-docs"></a>

## API Docs | API 文档

除 `/api/health`、注册、登录和用户检查外，内部业务 API 需要 Bearer Token 认证（`Authorization: Bearer <token>`）。

### Authentication | 认证

```bash
GET  /api/health               # 健康检查
GET  /api/auth/check-users     # 检查是否已有用户
POST /api/auth/register        # 注册  Body: { email, password, inviteCode }
POST /api/auth/login            # 登录  Body: { email, password }
POST /api/auth/verify           # 验证 Token
```

### Orders | 商单

```bash
GET    /api/orders              # 获取全部商单
POST   /api/orders              # 创建商单（自动创建待办）
PUT    /api/orders/:id          # 更新商单（自动同步账单/资产/待办）
DELETE /api/orders/:id          # 删除商单（级联删除关联数据）
```

### Payments | 账单

```bash
GET    /api/payments            # 获取全部账单
POST   /api/payments            # 创建账单
PUT    /api/payments/:id        # 更新账单
DELETE /api/payments/:id        # 删除账单
```

### Brands | 品牌

```bash
GET    /api/brands              # 获取全部品牌
GET    /api/brands/:id          # 获取单个品牌
POST   /api/brands              # 创建品牌
PUT    /api/brands/:id          # 更新品牌（支持多联系人）
DELETE /api/brands/:id          # 删除品牌（清理关联商单品牌信息）
```

### Assets | 资产

```bash
GET    /api/assets              # 获取全部资产
GET    /api/assets/:id          # 获取单个资产
PUT    /api/assets/:id          # 更新资产（名称、价值、售卖状态、图片）
DELETE /api/assets/:id          # 删除资产（已出资产自动扣减品牌收入）
```

### Todos | 待办

```bash
GET    /api/todos               # 获取全部待办
POST   /api/todos               # 创建待办
PUT    /api/todos/:id/update    # 更新待办
PUT    /api/todos/:id/toggle    # 切换完成状态
DELETE /api/todos/:id           # 删除待办
```

### Comments | 评论

```bash
GET    /api/comments/:orderId   # 获取商单评论
POST   /api/comments            # 添加评论  Body: { orderId, content }
DELETE /api/comments/:id        # 删除评论
```

### Logs | 操作日志

```bash
GET    /api/logs                # 获取操作日志（最近100条）
DELETE /api/logs                # 清空操作日志
```

### Publish Links | 发布链接

```bash
GET    /api/publish-links/:orderId    # 获取商单发布链接
POST   /api/publish-links             # 添加发布链接  Body: { orderId, url, platform? }
POST   /api/publish-links/batch       # 批量添加发布链接
PUT    /api/publish-links/:id         # 更新发布链接
DELETE /api/publish-links/:id         # 删除发布链接
```

### Data Import/Export | 数据导入导出

```bash
GET    /api/data/export          # 导出当前用户全部数据（JSON）
POST   /api/data/import          # 导入完整备份数据（JSON）
POST   /api/data/orders          # JSON 批量导入商单
POST   /api/data/orders/file     # Excel/CSV 文件导入商单（multipart/form-data）
POST   /api/data/clear           # 清空当前用户业务数据
```

### Settings | 设置

```bash
GET    /api/settings            # 获取用户设置
PUT    /api/settings            # 更新用户设置（主题、头像、昵称、API Key 等）
PUT    /api/settings/security   # 更新邮箱/密码
POST   /api/settings/apikey     # 生成 API Key
PUT    /api/settings/display    # 更新显示设置
```

### Reports | 报表

```bash
GET    /api/report/:type        # 获取指定类型统计报表
```

### External API | 外部 API（API Key 鉴权）

```bash
GET    /api/external/orders?token=<API_KEY>          # 获取商单列表
POST   /api/external/orders?token=<API_KEY>          # 创建商单
PUT    /api/external/orders/:id?token=<API_KEY>      # 更新商单
DELETE /api/external/orders/:id?token=<API_KEY>      # 删除商单
GET    /api/external/todos?token=<API_KEY>           # 获取待办列表
GET    /api/external/payments?token=<API_KEY>        # 获取账单列表
GET    /api/external/brands?token=<API_KEY>          # 获取品牌列表
GET    /api/external/statistics?token=<API_KEY>      # 获取统计数据
GET    /api/external/export?token=<API_KEY>          # 导出数据
```

---

<a id="tech-stack"></a>

## Tech Stack | 技术栈

| Category | 分类 | Tech | 技术 |
|----------|------|------|------|
| Frontend | 前端 | React 19, TypeScript, Tailwind CSS |
| Backend | 后端 | Express, better-sqlite3 |
| State | 状态 | Zustand |
| Charts | 图表 | Recharts |
| UI | 组件 | Lucide React, Motion |
| Data | 数据处理 | xlsx (Excel 导入导出), multer (文件上传) |
| Security | 安全 | bcrypt, JWT, helmet, express-rate-limit |
| Mobile | 移动端 | Capacitor (Android) |
| Deployment | 部署 | Docker, Vercel |

---

## 📝 更新日志 | Changelog

### 2026-05-21

- **年月筛选**: 商单页面新增按年/月查看功能，月份筛选依据接单日期；账单页面新增按年/月查看功能，月份筛选依据账单创建日期
- **账单统计联动**: 账单页已结算、待结算、总金额和列表会随年份/月度筛选同步变化
- **Android 构建更新**: 已重新构建 Web 资源并同步到 Android 工程，移动端包包含最新筛选功能
- **Release 签名包**: 新增本地 Release 签名 APK 构建说明，并将 Android 签名证书类型加入忽略规则，避免误提交私钥文件
- **README 展示调整**: 将项目使用教程提前到顶部区域，并补充作者公众号与什么值得买主页

### 2026-05-20

- **Android App**: 新增 Capacitor Android 客户端，App 端登录支持填写服务端地址，复用 Web 端账号体系
- **局域网访问**: 服务端监听 `0.0.0.0:3000`，支持同一局域网手机浏览器和 App 访问
- **移动端网络修复**: App 内普通接口和文件导入走 Capacitor 原生 HTTP 能力，减少 WebView 网络限制导致的连接失败
- **App 图标与名称**: Android App 名称为 `KOLFlow`，图标使用 `public/app.png`
- **数据清空稳定性**: 清空数据改为事务处理，并确保 SQLite 外键约束在异常时恢复
- **生产错误响应**: 生产服务补充统一 JSON 错误处理中间件，避免 API 异常返回 HTML 错误页
- **文档更新**: 补充 Android 构建、服务端地址、局域网访问和数据导入导出接口说明

### 2026-05-15

- **资产收入统计**: 资产库已出金额全面计入收入统计，仪表盘和统计页面的总收入、月度趋势、品牌排行均包含资产已出收入
- **资产总价值优化**: 资产库总价值计算改为自留资产按原价值、已出资产按实际售出金额分别统计
- **数据联动完善**: 资产标记为"已出"后自动更新品牌总收入，确保品牌维度的收入数据完整
- **品牌页修复**: 修复品牌统计未监听资产数据变化导致收入不实时更新的问题
- **统计页修复**: 修复平均客单价计算包含资产收入导致虚高的问题，修复全年模式环比对比错误
- **资产删除修复**: 删除已出资产时自动扣减品牌收入，保持数据一致性
- **README 展示图**: 添加 GitHub 项目展示图到 README 置顶位置
- **文档完善**: 补充操作日志功能说明，API 文档从 3 类扩展到 12 类完整接口，技术栈补充 UI 组件、数据处理、移动端等模块

### 2026-05-14

- **资产库**: 新增资产库模块，管理置换合作和E卡合作获得的产品资产
- **售卖状态追踪**: 资产支持标记"自留"或"已出"，已出可填写已出金额
- **E卡合作类型**: 商单新增E卡合作类型，按面值管理，完成时自动计入资产库
- **置换产品管理**: 置换类型商单支持填写产品名称和产品价值
- **类型变更数据同步**: 商单类型变更时自动同步关联数据（账单/资产），确保数据一致性
- **E卡资产展示**: 资产库中E卡与置换产品差异化展示，E卡使用京东E卡专属图片
- **导入导出兼容**: 全面兼容老版本数据导入导出，新增字段均有默认值

### 2026-05-12

- **品牌多联系人**: 品牌管理支持添加多个联系人，每个联系人可独立设置姓名、电话和备注
- **联系人备注**: 支持为每个联系人添加备注信息（如"负责商务对接"）
- **搜索增强**: 品牌搜索支持按联系人姓名、电话、备注进行模糊搜索
- **数据兼容**: 旧版单联系人数据自动迁移为新格式，无缝升级

### 2026-05-11

- **商单-账单金额联动**: 修改商单金额时自动同步更新关联账单金额
- **账单金额编辑修复**: 修复账单手动修改金额时的校验报错问题
- **字段更新逻辑优化**: 修复 `||` 运算符导致的空值覆盖问题，改用严格的 `undefined` 判断

### 2026-04

- **使用教程**: 添加值得买平台详细使用教程链接
- **赞赏支持**: README 中添加赞赏码和小程序码
- **认证流程优化**: 优化 JWT 认证和 API Key 鉴权逻辑
- **发布链接功能**: 修复发布链接批量添加和复制功能
- **UI 组件修复**: 修复服务器启动和前端 UI 组件问题

### 2026-03

- **Docker 多架构支持**: 支持 amd64 / arm64 双架构自动构建
- **GitHub Actions CI**: 添加自动构建 Docker 镜像的工作流
- **中英双语 README**: README 全面支持中英文双语展示
- **开源协议**: 更新为 MIT License 并完善协议说明

### 更早版本

- **核心功能**: 仪表盘、商单管理、待办日历、账单管理、品牌管理、资产库、数据统计
- **数据联动**: 创建商单自动生成待办、商单完成自动创建账单/资产、类型变更双向同步、删除品牌自动清理关联数据
- **API 系统**: 内部 RESTful API + 外部 API Key 鉴权体系
- **主题外观**: 支持亮色/暗色主题切换
- **剪贴板功能**: 修复复制到剪贴板兼容性问题

---

## License | 许可证

**MIT License** - Commercial use allowed, but must retain author attribution.

详细许可证内容请查看 [LICENSE](LICENSE) 文件。

---

## Author | 作者

**Panda-995**

- GitHub: https://github.com/Panda-995
- Email: 676096193@qq.com
- 公众号：Panda不是猫
- 什么值得买主页：https://zhiyou.smzdm.com/member/9256201282/

---

## Support | 支持

如果这个项目对你有帮助，欢迎赞赏支持！

<table align="center">
  <tr>
    <td align="center">
      <img src="public/赞赏码.png" width="200" alt="赞赏码">
      <br>
      <sub>赞赏码</sub>
    </td>
    <td align="center">
      <img src="public/小程序.jpg" width="200" alt="小程序码">
      <br>
      <sub>小程序码</sub>
    </td>
  </tr>
</table>

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Panda-995">Panda-995</a>
</p>
