# KOLFlow

<p align="center">
  <strong>达人商单流管理系统</strong><br>
  <sub>轻松管理每一笔合作，让商单管理更高效</sub>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#部署">部署</a> •
  <a href="#api-文档">API 文档</a> •
  <a href="#技术栈">技术栈</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green.svg" alt="Node.js">
  <img src="https://img.shields.io/badge/React-19-blue.svg" alt="React">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License">
</p>

---

## 功能特性

- 📊 **仪表盘** - 收入统计、月度目标进度，商单概览
- 📦 **商单管理** - 创建、编辑、状态跟踪、批量导入/导出
- ✅ **待办/日历** - 任务管理、日历视图、优先级标签
- 💰 **账单管理** - 收支统计、结算状态、月份筛选
- 🏢 **品牌管理** - 品牌信息维护，合作统计
- 📈 **数据统计** - 多维度筛选、图表可视化
- 🔐 **安全设置** - API Key 管理、账号安全
- 🎨 **主题外观** - 5种配色方案

### 数据联动

| 操作 | 联动效果 |
|------|----------|
| 创建商单 | 自动创建关联待办 |
| 商单完成 | 自动创建待结算账单 |
| 删除品牌 | 关联商单品牌置空 |
| 待办全部完成 | 关联商单标记完成 |

---

## 快速开始

### 环境要求

- **Node.js >= 20.19.0** 或 **>= 22.12.0** (必需)
- npm >= 9

> **注意**: 由于 `@vitejs/plugin-react@5.x` 的要求，Node.js 版本必须达到 20.19.0 或 22.12.0 以上。
> 建议使用 [nvm](https://github.com/nvm-sh/nvm) 管理 Node.js 版本。

### 安装

```bash
# 克隆仓库
git clone https://github.com/Panda-995/KOLFlow.git
cd KOLFlow

# 安装依赖
npm install
```

### 配置

创建 `.env` 文件：

```env
# 生产环境必须设置
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secret-key-here
INVITE_CODE=your-invite-code
```

> **安全提示**: 
> - 生产环境必须配置 `JWT_SECRET`，否则应用无法启动
> - 建议使用 `openssl rand -hex 32` 或 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成安全密钥
> - 不要将 `.env` 文件提交到版本控制

### 运行

```bash
# 开发模式
npm run dev

# 生产构建
npm run build
npm run preview
```

访问 http://localhost:3000 开始使用。

### 首次使用

1. 访问 http://localhost:3000
2. 点击「注册账号」
3. 输入邮箱、密码和邀请码

---

## 部署

### Docker 部署（推荐）

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

需要配置环境变量：
```bash
export JWT_SECRET=your-secret-key
export INVITE_CODE=your-invite-code
docker-compose up -d
```

### Vercel 部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel --prod
```

### 宝塔面板部署

1. 上传代码到服务器
2. 使用 Node.js 项目管理器
3. 设置环境变量
4. 启动项目

---

## API 文档

### 认证

```bash
# 注册
POST /api/auth/register
Body: { email, password, inviteCode }

# 登录
POST /api/auth/login
Body: { email, password }

# 验证 Token
POST /api/auth/verify
Headers: Authorization: Bearer <token>
```

### 商单

```bash
# 获取列表
GET /api/orders
Headers: Authorization: Bearer <token>

# 创建
POST /api/orders
Body: { title, type, brandName, ... }

# 更新
PUT /api/orders/:id
Body: { ... }

# 删除
DELETE /api/orders/:id
```

### 外部 API

```bash
# 公开接口（需要 API Key）
GET /api/external/orders?token=<API_KEY>
GET /api/external/statistics?token=<API_KEY>
```

---

## 技术栈

| 分类 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, Tailwind CSS |
| 后端 | Express, better-sqlite3 |
| 状态 | Zustand |
| 图表 | Recharts |
| 安全 | bcrypt, JWT, helmet |
| 部署 | Docker, Vercel |

---

## 许可证

**MIT License** - 可免费商用，但必须保留作者信息

详细许可证内容请查看 [LICENSE](LICENSE) 文件。

---

## 作者

**Panda-995**

- GitHub: https://github.com/Panda-995
- Email: 676096193@qq.com

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Panda-995">Panda-995</a>
</p>
