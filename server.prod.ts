import 'dotenv/config';
import express, { ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import apiRoutes from './src/server/api.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Security: Helmet HTTP headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
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
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS with origin validation
const configuredCorsOrigins = process.env.CORS_ORIGIN?.split(',').map(origin => origin.trim()).filter(Boolean);
const allowedOrigins = configuredCorsOrigins?.length
  ? configuredCorsOrigins
  : [
    'http://localhost',
    'https://localhost',
    'http://localhost:3000',
    'http://localhost:5173',
    'capacitor://localhost',
    'ionic://localhost',
  ];

app.use((req, res, next): void => {
  const origin = req.headers.origin;
  if (origin && (!configuredCorsOrigins?.length || allowedOrigins.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.header('Access-Control-Allow-Origin', '*');
  }
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

// API rate limiter
app.use('/api/', apiLimiter);

// 安全中间件：阻止直接访问 uploads 目录
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', apiRoutes);

// Global API error handler. Keep this before static files so production API
// failures are returned as JSON instead of Express HTML error pages.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = err.status || (err.message?.includes('未授权') ? 401 : 500);
  res.status(status).json({
    error: err.message || '服务器内部错误',
  });
};

app.use(errorHandler);

// Static files
app.use(express.static('dist'));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile('index.html', { root: 'dist' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
