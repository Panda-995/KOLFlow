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

---

## 功能特性

- 📊 **仪表盘** - 收入统计、月度目标进度、商单概览
- 📦 **商单管理** - 创建、编辑、状态跟踪、批量导入/导出
- ✅ **待办/日历** - 任务管理、日历视图、优先级标签
- 💰 **账单管理** - 收支统计、结算状态、月份筛选
- 🏢 **品牌管理** - 品牌信息维护、合作统计
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
git clone https://github.com/your-username/kolflow.git
cd kolflow

# 安装依赖
npm install
```

### 配置

创建 `.env` 文件：

```env
# 生产环境必须设置
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secret-key-here  # 使用强随机密钥
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

### Docker（推荐）

```bash
# 使用 docker-compose
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 手动部署

```bash
# 构建镜像
docker build -t kolflow:latest .

# 运行容器
docker run -d \
  --name kolflow \
  -p 3000:3000 \
  -v kolflow-data:/app/data \
  --restart unless-stopped \
  kolflow:latest
```

### 数据持久化

| 目录 | 说明 |
|------|------|
| `/app/data/database.sqlite` | SQLite 数据库 |
| `/app/data/uploads/` | 上传的文件 |

---

## API 文档

### 认证方式

支持三种认证方式：

```bash
# 1. Authorization Header（推荐）
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/orders

# 2. URL 参数
curl "http://localhost:3000/api/orders?token=<api-key>"

# 3. API Key（外部接口）
curl "http://localhost:3000/api/external/orders?key=<api-key>"
```

### 接口列表

#### 认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/verify` | 验证 Token |

#### 商单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/orders` | 获取商单列表 |
| POST | `/api/orders` | 创建商单 |
| PUT | `/api/orders/:id` | 更新商单 |
| DELETE | `/api/orders/:id` | 删除商单 |

#### 品牌

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/brands` | 获取品牌列表 |
| POST | `/api/brands` | 创建品牌 |
| PUT | `/api/brands/:id` | 更新品牌 |
| DELETE | `/api/brands/:id` | 删除品牌 |

#### 待办

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/todos` | 获取待办列表 |
| POST | `/api/todos` | 创建待办 |
| PUT | `/api/todos/:id/update` | 更新待办 |
| PUT | `/api/todos/:id/toggle` | 切换完成状态 |
| DELETE | `/api/todos/:id` | 删除待办 |

#### 账单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/payments` | 获取账单列表 |
| POST | `/api/payments` | 创建账单 |
| PUT | `/api/payments/:id` | 更新账单 |
| PUT | `/api/payments/:id/settle` | 结算账单 |
| DELETE | `/api/payments/:id` | 删除账单 |

#### 外部 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/external/orders` | 商单列表 |
| GET | `/api/external/statistics` | 统计数据 |
| GET | `/api/external/export` | 导出全部数据 |

---

## 技术栈

### 前端

- **React 19** - UI 框架
- **TypeScript** - 类型安全
- **Zustand** - 状态管理
- **React Router** - 路由
- **Tailwind CSS** - 样式
- **Recharts** - 图表
- **Lucide React** - 图标
- **date-fns** - 日期处理

### 后端

- **Express** - Web 框架
- **SQLite** (better-sqlite3) - 数据库
- **JWT** - 认证
- **bcrypt** - 密码加密

---

## 项目结构

```
kolflow/
├── src/
│   ├── components/        # 公共组件
│   ├── hooks/             # 自定义 Hooks
│   ├── pages/             # 页面组件
│   ├── server/            # 后端代码
│   │   ├── routes/        # API 路由
│   │   ├── services/      # 业务服务
│   │   └── utils/         # 工具函数
│   ├── store/             # Zustand Store
│   └── types/             # TypeScript 类型
├── public/                # 静态资源
├── server.ts              # 服务入口
├── vite.config.ts         # Vite 配置
├── Dockerfile             # Docker 构建
├── docker-compose.yml     # Docker Compose
└── package.json
```

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + Alt + N` | 新建商单 |
| `Ctrl + Alt + T` | 待办管理 |
| `Ctrl + Alt + B` | 品牌管理 |
| `Ctrl + Alt + S` | 系统设置 |

---

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `NODE_ENV` | development | 运行环境 |
| `JWT_SECRET` | - | JWT 密钥（生产环境必须修改） |
| `INVITE_CODE` | panda995 | 注册邀请码 |

---

## 开发

```bash
# 开发模式
npm run dev

# 类型检查
npm run lint

# 构建生产版本
npm run build
```

---

## 贡献

欢迎提交 Issue 和 Pull Request。

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

---

## 许可证

本项目仅供个人学习和研究使用。

---

<p align="center">
  Made with ❤️ by KOLFlow Team
</p>