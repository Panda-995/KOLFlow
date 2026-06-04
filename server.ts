import 'dotenv/config';
import express, { ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import apiRoutes from './src/server/api.js';
import os from 'os';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Security: Helmet HTTP headers
  app.use(helmet({
    contentSecurityPolicy: false,
  }));

  // Rate limiting for auth routes
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: { error: '登录尝试过多，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests
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
  const isOriginAllowed = (origin: string): boolean => {
    if (allowAnyOrigin) return true;
    if (allowedOrigins.includes(origin)) return true;
    try {
      const parsed = new URL(origin);
      return ['http:', 'https:', 'capacitor:', 'ionic:'].includes(parsed.protocol);
    } catch {
      return false;
    }
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

  app.use(express.json({ limit: '10mb' }));

  // Stricter auth rate limiter
  app.use(['/api/auth/login', '/api/auth/register'], loginLimiter);

  // 安全中间件：阻止直接访问 uploads 目录
  app.use('/uploads', (_req, res) => {
    res.status(403).json({ error: '禁止直接访问上传文件' });
  });

  // API rate limiter
  app.use('/api/', apiLimiter);

// Health check endpoint (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

  // API routes
  app.use('/api', apiRoutes);

  // 全局错误处理 - 必须在所有路由之后
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    // Determine status code
    const status = err.status || (err.message.includes('未授权') ? 401 : 500);
    
    // Return JSON error response (no stack trace in production)
    res.status(status).json({
      error: err.message || '服务器内部错误'
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
