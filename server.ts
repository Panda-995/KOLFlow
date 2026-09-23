import 'dotenv/config';
import express, { ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import apiRoutes from './src/server/api.js';
import {
  createRequireHttpsMiddleware,
  getHttpsEnforcementPolicy,
  resolveTrustProxy,
} from './src/server/transportSecurity.js';
import {
  configureJsonBodyParsers,
  getPayloadTooLargeMessage,
} from './src/server/requestBodyLimits.js';
import os from 'os';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const enforceHttps = getHttpsEnforcementPolicy(process.env);

  // Only honor X-Forwarded-Proto when a controlled reverse proxy is explicitly configured.
  app.set('trust proxy', resolveTrustProxy(process.env.TRUST_PROXY));

  // Security: Helmet HTTP headers
  // CSP 只对生产构建启用：开发模式下 Vite 会注入内联的 React Refresh 预置脚本
  // 并依赖 HMR 的 WebSocket，严格 CSP（script-src 'self'）会直接拦掉它导致白屏。
  const isProductionBuild = process.env.NODE_ENV === 'production';
  app.use(helmet({
    contentSecurityPolicy: isProductionBuild
      ? {
        // 显式关闭默认继承的 upgrade-insecure-requests：本项目主推局域网 HTTP 部署，
        // 一旦启用它，浏览器会把 http 页面里的所有子资源升级为 https，导致页面空白
        useDefaults: false,
        directives: {
          upgradeInsecureRequests: null,
          defaultSrc: ["'self'"],
          // 生产构建产物无内联脚本，脚本仅来自自身
          scriptSrc: ["'self'"],
          // 组件用内联 style 属性设置背景图/进度宽度
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'"],
          connectSrc: ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          scriptSrcAttr: ["'none'"],
        },
      }
      : false,
    // 其余安全头（HSTS/Referrer-Policy/CORP 等）继续使用 helmet 默认值
    crossOriginEmbedderPolicy: false,
  }));

  // Reject cleartext API traffic before parsing request bodies.
  app.use('/api', createRequireHttpsMiddleware(enforceHttps));

  // Rate limiting for auth routes
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60, // 60 failed attempts
    skipSuccessfulRequests: true,
    message: { error: '15 分钟内登录或注册失败次数过多（最多 60 次），请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 150, // 150 write requests per minute
    // 只对写操作限流：GET 请求是廉价的 SQLite 读取，页面切换与轮询不应消耗配额，
    // 否则连续刷新或同一出口 IP 的多用户会互相挤占额度导致 429。
    skip: req => req.method === 'GET'
      || ['/api/auth/login', '/api/auth/register', '/api/auth/verify', '/api/auth/check-users', '/api/auth/encryption-key']
        .includes(req.originalUrl.split('?')[0]),
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // CORS with origin validation
  // 获取局域网IP地址，允许APP从局域网访问
  const getLocalIPs = (): string[] => {
    const ips: string[] = [];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;

      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(`http://${iface.address}:3000`);
          ips.push(`http://${iface.address}:5173`);
        }
      }
    }
    return ips;
  };
  
  const configuredCorsOrigins = process.env.CORS_ORIGIN?.split(',').map(origin => origin.trim()).filter(Boolean) || [];
  const defaultAllowedOrigins = [
    'http://localhost',
    'https://localhost',
    'http://localhost:3000',
    'http://localhost:5173',
    'capacitor://localhost',
    'ionic://localhost',
    ...getLocalIPs(),
  ];
  const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...configuredCorsOrigins]));
  const allowAnyOrigin = configuredCorsOrigins.length === 0 || configuredCorsOrigins.includes('*');
  // 严格按白名单匹配：配置 CORS_ORIGIN 后，名单外的来源一律不放行。
  // 默认白名单已包含 localhost、局域网 IP 和 Capacitor/Ionic 应用来源。
  const isOriginAllowed = (origin: string): boolean => {
    if (allowAnyOrigin) return true;
    return allowedOrigins.includes(origin);
  };

  app.use((req, res, next): void => {
    const origin = req.headers.origin;
    if (origin && isOriginAllowed(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      res.header('Access-Control-Allow-Origin', '*');
    }
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // 限流先于请求体解析：避免未认证请求触发大体积 JSON 读取/解析（100MB 导入端点）
  app.use(['/api/auth/login', '/api/auth/register'], loginLimiter);

  // 通用写操作限流同样前置于解析，避免先读满 100MB 才拿到 429
  app.use('/api/', apiLimiter);

  // 公开认证端点（密钥下发/用户检查）单设低成本限流，避免被无限调用
  const publicAuthLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(['/api/auth/encryption-key', '/api/auth/check-users'], publicAuthLimiter);

  configureJsonBodyParsers(app);

  // 安全中间件：阻止直接访问 uploads 目录
  app.use('/uploads', (_req, res) => {
    res.status(403).json({ error: '禁止直接访问上传文件' });
  });

  // API rate limiter（前置到请求体解析之前，见下方注册点）

// Health check endpoint (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

  // API routes
  app.use('/api', apiRoutes);

  // 未匹配的 /api 路径统一返回 JSON 404，避免前端把 HTML 当 JSON 解析
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: '接口不存在' });
  });

  // 全局错误处理 - 必须在所有路由之后
  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    // Determine status code
    const isPayloadTooLarge = err.status === 413 || err.type === 'entity.too.large';
    const message = typeof err.message === 'string' ? err.message : '';
    const status = err.status || (message.includes('未授权') ? 401 : 500);
    
    // Return JSON error response (no stack trace in production)
    res.status(status).json({
      error: isPayloadTooLarge
        ? getPayloadTooLargeMessage(req.originalUrl)
        : (message || '服务器内部错误')
    });
  };
  
  app.use(errorHandler);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // 静态文件
    app.use(express.static('dist'));

    // SPA 路由回退：所有非 API 路由返回 index.html
    app.get('*', (_req, res) => {
      res.sendFile('index.html', { root: 'dist' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
