import 'dotenv/config';
import express, { ErrorRequestHandler } from 'express';
import { createServer as createViteServer } from 'vite';
import apiRoutes from './src/server/api.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // CORS for mobile app
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  // 安全中间件：阻止直接访问 uploads 目录
  app.use('/uploads', (req, res) => {
    res.status(403).json({ error: '禁止直接访问上传文件' });
  });

  // Health check endpoint (no auth required)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api', apiRoutes);

  // Global error handler - must be after all routes
  const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // 静态文件
    app.use(express.static('dist'));

    // SPA 路由回退：所有非 API 路由返回 index.html
    app.get('*', (req, res) => {
      res.sendFile('index.html', { root: 'dist' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
