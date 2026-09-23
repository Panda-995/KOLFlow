import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
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

// 记录操作日志（createdAt 使用带时区的 ISO UTC 字符串，避免 SQLite 默认值的无时区格式）
export const logActivity = (userId: string, action: string, entityType: string, entityId: string, details?: string) => {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO activity_logs (id, userId, action, entityType, entityId, details, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, action, entityType, entityId, details || null, new Date().toISOString());
};

// 生成 JWT Token（携带签发时的 tokenVersion，修改密码后旧版本立即失效）
export const generateToken = (userId: string, _email?: string): string => {
  const user = db.prepare('SELECT tokenVersion FROM users WHERE id = ?').get(userId) as { tokenVersion?: number } | undefined;
  const tokenVersion = typeof user?.tokenVersion === 'number' ? user.tokenVersion : 0;
  return jwt.sign({ userId, ver: tokenVersion }, JWT_SECRET, { expiresIn: '7d' });
};

// 验证 JWT Token
export const verifyToken = (token: string): { userId: string } | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch (e) {
    console.error('JWT验证失败:', e instanceof Error ? e.message : e);
    return null;
  }
};

// 校验 token 是否仍然有效：签名与期限之外，还要求用户存在且 tokenVersion 匹配。
// 旧版 token 没有 ver 字段，按 0 处理（与列默认值一致，升级后已有会话不受影响）。
export const isTokenActiveForUser = (decoded: { userId?: string; ver?: number }): boolean => {
  if (!decoded?.userId) return false;
  const user = db.prepare('SELECT tokenVersion FROM users WHERE id = ?').get(decoded.userId) as { tokenVersion?: number } | undefined;
  if (!user) return false;
  const tokenVersion = typeof decoded.ver === 'number' ? decoded.ver : 0;
  return (typeof user.tokenVersion === 'number' ? user.tokenVersion : 0) === tokenVersion;
};

// 从请求头获取用户 ID。内部 API 只接受登录 JWT；API Key 仅用于 /api/external。
export const getUserId = (req: Request): string => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded && isTokenActiveForUser(decoded)) {
      req.userId = decoded.userId;
      return decoded.userId;
    }
  }

  throw new Error('未授权访问，请先登录');
};

// 账号维度登录失败限制：反向代理共享出口 IP 时，IP 限流会让一台攻击者锁死所有用户，
// 因此额外按账号记录失败次数（内存即可，重启后重置）。
// 采用滑动窗口：每次失败都续期窗口，命中上限后锁定 LOCK_MS，慢速爆破无法绕过。
const ACCOUNT_FAILURE_LIMIT = 8;
const ACCOUNT_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_FAILURE_MAX_ENTRIES = 5000;

interface AccountFailureRecord {
  count: number;
  lastFailureAt: number;
  lockedUntil: number;
}

const accountFailures = new Map<string, AccountFailureRecord>();

const pruneAccountFailures = (now: number): void => {
  for (const [key, record] of accountFailures) {
    if (now >= record.lockedUntil && now - record.lastFailureAt > ACCOUNT_FAILURE_WINDOW_MS) {
      accountFailures.delete(key);
    }
  }
  // 容量兜底：条目过多时按最早失败时间淘汰，避免内存被随机邮箱撑大
  if (accountFailures.size > ACCOUNT_FAILURE_MAX_ENTRIES) {
    const sorted = Array.from(accountFailures.entries()).sort((a, b) => a[1].lastFailureAt - b[1].lastFailureAt);
    for (const [key] of sorted.slice(0, accountFailures.size - ACCOUNT_FAILURE_MAX_ENTRIES)) {
      accountFailures.delete(key);
    }
  }
};

export const isAccountLocked = (email: string): boolean => {
  const key = email.toLowerCase();
  const record = accountFailures.get(key);
  if (!record) return false;
  const now = Date.now();
  if (record.lockedUntil > now) return true;
  if (now - record.lastFailureAt > ACCOUNT_FAILURE_WINDOW_MS) {
    accountFailures.delete(key);
    return false;
  }
  return record.count >= ACCOUNT_FAILURE_LIMIT;
};

export const recordAccountFailure = (email: string): void => {
  const key = email.toLowerCase();
  const now = Date.now();
  pruneAccountFailures(now);
  const record = accountFailures.get(key);
  if (!record || now - record.lastFailureAt > ACCOUNT_FAILURE_WINDOW_MS) {
    accountFailures.set(key, { count: 1, lastFailureAt: now, lockedUntil: 0 });
    return;
  }
  record.count += 1;
  record.lastFailureAt = now; // 滑动窗口：每次失败续期
  if (record.count >= ACCOUNT_FAILURE_LIMIT) {
    // 命中上限后从此刻起锁定完整窗口，与提示文案一致
    record.lockedUntil = now + ACCOUNT_FAILURE_WINDOW_MS;
    record.count = 0;
  }
};

export const clearAccountFailures = (email: string): void => {
  accountFailures.delete(email.toLowerCase());
};

// 生成加密安全的随机字符串
export const generateSecureRandom = (length: number = 32): string => {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};

// 获取 API Key 对应的用户 ID
export const getUserIdByApiKey = (apiKey: string): string | null => {
  if (!apiKey) return null;
  const matches = db.prepare('SELECT userId FROM settings WHERE apiKey = ? LIMIT 2').all(apiKey) as Array<{ userId: string }>;
  return matches.length === 1 ? matches[0].userId : null;
};

// 认证中间件
export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  try {
    getUserId(req);
    next();
  } catch {
    res.status(401).json({ error: '未授权访问，请先登录' });
  }
};
