# KOLFlow

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

## Features | 功能特性

| Feature | 功能 |
|---------|------|
| 📊 Dashboard | 📊 仪表盘 |
| 📦 Order Management | 📦 商单管理 |
| ✅ Todo & Calendar | ✅ 待办/日历 |
| 💰 Billing | 💰 账单管理 |
| 🏢 Brand Management | 🏢 品牌管理 |
| 📈 Analytics | 📈 数据统计 |
| 🔐 API Key Management | 🔐 API Key 管理 |
| 🎨 Themes | 🎨 主题外观 |

### Data Linkage | 数据联动

| Action | 操作 | Effect | 效果 |
|--------|------|--------|------|
| Create Order | 创建商单 | Auto-create Todo | 自动创建待办 |
| Complete Order | 商单完成 | Auto-create Bill | 自动创建账单 |
| Delete Brand | 删除品牌 | Clear brand info | 品牌信息置空 |
| Complete All Todos | 待办全部完成 | Mark order complete | 关联商单标记完成 |

---

## Getting Started | 快速开始

### Requirements | 环境要求

- **Node.js >= 20.19.0** or **>= 22.12.0**
- npm >= 9

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
```

### Run | 运行

```bash
# Development | 开发模式
npm run dev

# Production | 生产构建
npm run build
npm run preview
```

### First Use | 首次使用

1. Visit http://localhost:3000
2. Click "注册账号" (Register)
3. Enter email, password, and invite code

---

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

## API Docs | API 文档

### Authentication | 认证

```bash
# Register | 注册
POST /api/auth/register
Body: { email, password, inviteCode }

# Login | 登录
POST /api/auth/login
Body: { email, password }

# Verify Token | 验证 Token
POST /api/auth/verify
Headers: Authorization: Bearer <token>
```

### External API | 外部 API

```bash
GET /api/external/orders?token=<API_KEY>
GET /api/external/statistics?token=<API_KEY>
```

---

## Tech Stack | 技术栈

| Category | 分类 | Tech | 技术 |
|----------|------|------|------|
| Frontend | 前端 | React 19, TypeScript, Tailwind CSS |
| Backend | 后端 | Express, better-sqlite3 |
| State | 状态 | Zustand |
| Charts | 图表 | Recharts |
| Security | 安全 | bcrypt, JWT, helmet |
| Deployment | 部署 | Docker, Vercel |

---

## 📝 更新日志 | Changelog

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

- **核心功能**: 仪表盘、商单管理、待办日历、账单管理、品牌管理、数据统计
- **数据联动**: 创建商单自动生成待办、商单完成自动创建账单、删除品牌自动清理关联数据
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

---

## Support | 支持

如果这个项目对你有帮助，欢迎赞赏支持！

### Tutorial | 使用教程

值得买详细教程：[KOLFlow 达人商单管理系统使用教程](https://post.smzdm.com/p/a6zg63m0/)

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