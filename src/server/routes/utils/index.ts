import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import db from '../../db.js';
import crypto from 'crypto';

// JWT_SECRET 配置：优先使用环境变量，开发环境提供安全默认值
// 生产环境必须配置 JWT_SECRET 环境变量，否则抛出错误
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('生产环境必须配置 JWT_SECRET 环境变量');
  }
  // 开发环境使用随机密钥（注意：重启后会变化，导致旧 token 失效）
  return 'kolflow-dev-jwt-' + crypto.randomBytes(16).toString('hex');
})();

export const getJwtSecret = (): string => JWT_SECRET;

// 记录操作日志
export const logActivity = (userId: string, action: string, entityType: string, entityId: string, details?: string) => {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO activity_logs (id, userId, action, entityType, entityId, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, action, entityType, entityId, details || null);
};

// 生成 JWT Token
export const generateToken = (userId: string, email: string): string => {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
};

// 验证 JWT Token
export const verifyToken = (token: string): { userId: string; email: string } | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch {
    return null;
  }
};

// 从请求头获取用户 ID (支持 JWT 和旧的 x-user-id 方式用于兼容)
export const getUserId = (req: any): string => {
  const authHeader = req.headers.authorization;

  // 支持 URL 参数认证 (?token=xxx 或 ?key=xxx)
  const urlToken = req.query.token || req.query.key;

  if (urlToken) {
    const userId = getUserIdByApiKey(urlToken as string);
    if (userId) {
      req.userId = userId;
      return userId;
    }
  }

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // 尝试 API Key 认证
    const userIdByKey = getUserIdByApiKey(token);
    if (userIdByKey) {
      req.userId = userIdByKey;
      return userIdByKey;
    }
    // 尝试 JWT 认证
    const decoded = verifyToken(token);
    if (decoded) {
      req.userId = decoded.userId;
      req.userEmail = decoded.email;
      return decoded.userId;
    }
  }

  throw new Error('未授权访问，请先登录');
};

// 生成加密安全的随机字符串
export const generateSecureRandom = (length: number = 32): string => {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};

// 获取 API Key 对应的用户 ID
export const getUserIdByApiKey = (apiKey: string): string | null => {
  const settings = db.prepare('SELECT userId FROM settings WHERE apiKey = ?').get(apiKey) as any;
  return settings?.userId || null;
};

// 认证中间件
export const authMiddleware = (req: any, res: any, next: any) => {
  try {
    getUserId(req);
    next();
  } catch (error) {
    res.status(401).json({ error: '未授权访问，请先登录' });
  }
};
