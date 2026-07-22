import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { logActivity, generateToken, verifyToken } from './utils/index.js';
import { VALID_INVITE_CODE } from './utils/constants.js';
import { validateEmail, validatePassword } from './utils/helpers.js';
import {
  issueAuthEncryptionKey,
  readEncryptedSensitiveBody,
} from '../services/authEncryptionService.js';

const router = Router();

const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

router.get('/encryption-key', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json(issueAuthEncryptionKey());
});

router.post('/register', async (req, res) => {
  try {
    const payload = readEncryptedSensitiveBody(req.body);
    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const inviteCode = typeof payload.inviteCode === 'string' ? payload.inviteCode : '';
    const privacyAccepted = payload.privacyAccepted;

    if (privacyAccepted !== true) {
      return res.status(400).json({ error: '请先阅读并同意隐私政策' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: '请输入有效的邮箱地址' });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }

    if (!inviteCode) {
      return res.status(400).json({ error: '请输入邀请码' });
    }

    if (inviteCode.toLowerCase() !== VALID_INVITE_CODE.toLowerCase()) {
      return res.status(400).json({ error: '邀请码无效' });
    }

    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (existingUser) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }

    const hashedPassword = await hashPassword(password);

    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, email, password, displayName)
      VALUES (?, ?, ?, ?)
    `).run(userId, email, hashedPassword, email.split('@')[0]);

    db.prepare(`
      INSERT INTO settings (id, userId, displayName, email, bio, orderReminder, weeklyReport)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), userId, email.split('@')[0], email, '', 1, 0);

    logActivity(userId, 'register', 'user', userId, `新用户注册: ${email}`);

    const token = generateToken(userId);
    return res.json({ success: true, userId, token });
  } catch (error) {
    if (error instanceof Error && error.message.includes('认证')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('注册错误:', error);
    return res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const payload = readEncryptedSensitiveBody(req.body);
    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const privacyAccepted = payload.privacyAccepted;

    if (privacyAccepted !== true) {
      return res.status(400).json({ error: '请先阅读并同意隐私政策' });
    }

    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    logActivity(user.id, 'login', 'user', user.id, `用户登录: ${email}`);

    const token = generateToken(user.id);
    return res.json({ success: true, userId: user.id, token });
  } catch (error) {
    if (error instanceof Error && error.message.includes('认证')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('登录错误:', error);
    return res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

router.post('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false, error: '未提供认证令牌' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  
  if (decoded) {
    return res.json({ valid: true, userId: decoded.userId });
  } else {
    return res.status(401).json({ valid: false, error: '令牌无效或已过期' });
  }
});

router.get('/check-users', (_req, res) => {
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    res.json({ hasUsers: !!user });
  } catch (error) {
    console.error('检查用户存在失败:', error instanceof Error ? error.message : error);
    res.json({ hasUsers: false });
  }
});

export default router;
