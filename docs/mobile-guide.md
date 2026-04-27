# KOLFlow 移动端开发指南

## 快速开始

### 1. 安装 Capacitor 依赖

```bash
npm install
```

### 2. 构建 Web 应用

```bash
npm run build
```

### 3. 初始化 Capacitor（首次）

```bash
npm run cap:init
```

### 4. 添加 Android 平台

```bash
npm run cap:add
```

### 5. 同步到 Android

```bash
npm run cap:sync
```

### 6. 打开 Android Studio

```bash
npm run cap:open
```

---

## 开发调试

### Live Reload 模式

```bash
# 设置 Live URL（你的开发机局域网 IP）
set CAP_LIVE_URL=http://192.168.1.100:5173

# 运行 Live Reload
npm run cap:live
```

> **注意**: Live Reload 模式下，WebView 会直接加载开发机的 Vite 服务器，代码修改后实时刷新。

---

## 移动端特性

### 已实现功能

| 功能 | 说明 |
|------|------|
| **底部导航栏** | 5 个核心页面快速切换 |
| **浮动操作按钮 (FAB)** | 快速新建商单/待办/账单 |
| **抽屉式侧边栏** | 滑动菜单，完整的页面导航 |
| **服务器配置** | 首次启动配置远程服务器地址 |
| **安全区域适配** | 刘海屏/底部手势条完美适配 |
| **触摸优化** | 44px 最小触摸目标 |
| **响应式布局** | 移动端单列卡片布局 |

### 移动端组件

| 组件 | 文件 | 功能 |
|------|------|------|
| MobileNav | `src/components/MobileNav.tsx` | 底部导航栏 |
| FAB | `src/components/FAB.tsx` | 浮动操作按钮 |
| ServerConnect | `src/pages/ServerConnect.tsx` | 服务器连接配置 |

---

## APK 构建

### Release 版本

1. **配置签名**（在 `android/` 目录下创建 `keystore.properties`）:

```properties
storePassword=your_password
keyPassword=your_password
keyAlias=kolflow
storeFile=../kolflow.keystore
```

2. **生成签名密钥**:

```bash
keytool -genkey -v -keystore kolflow.keystore -alias kolflow -keyalg RSA -keysize 2048 -validity 10000
```

3. **构建 APK**:

在 Android Studio 中：
- Build → Generate Signed Bundle/APK
- 选择 APK
- 选择签名配置
- Build

或在命令行：

```bash
cd android
./gradlew assembleRelease
```

APK 输出位置: `android/app/build/outputs/apk/release/`

---

## 服务器配置

移动端首次启动时会要求配置服务器地址。

格式: `http://IP地址:端口`

示例:
- `http://localhost:3000` (本机)
- `http://192.168.1.100:3000` (局域网)
- `https://your-domain.com` (公网)

> **提示**: 建议生产环境使用 HTTPS。

---

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Capacitor | 6.0 | 跨平台原生桥 |
| React | 19.0 | UI 框架 |
| Tailwind CSS | 4.x | 响应式样式 |

---

## 常见问题

### Q: 连接服务器失败？

检查：
1. 服务器地址格式正确（http://开头）
2. 服务器已启动并监听正确端口
3. 手机和服务器在同一局域网
4. 防火墙允许访问

### Q: 白屏问题？

检查：
1. 服务器地址已配置
2. API 调用无错误
3. 清除应用数据重新配置

### Q: 签名构建失败？

检查：
1. keystore 文件路径正确
2. 密码配置正确
3. alias 名称一致

---

## 文件结构

```
KOLFlow/
├── capacitor.config.ts    # Capacitor 配置
├── src/
│   ├── components/
│   │   ├── MobileNav.tsx  # 底部导航
│   │   ├── FAB.tsx        # 浮动按钮
│   │   └── Layout.tsx     # 主布局（已适配）
│   ├── pages/
│   │   ├── ServerConnect.tsx # 服务器配置
│   ├── hooks/
│   │   ├── useCapacitor.ts # Capacitor Hook
│   ├── lib/
│   │   ├── mobileApi.ts   # 移动端 API
│   └── types/
│       └── capacitor.d.ts # 类型声明
├── android/               # Android 项目（cap sync 后生成）
└── package.json           # 包含 Capacitor 脚本
```

---

## 下一步

1. 安装依赖: `npm install`
2. 构建项目: `npm run build`
3. 同步 Capacitor: `npm run cap:sync`
4. 打开 Android Studio: `npm run cap:open`
5. 构建并测试 APK