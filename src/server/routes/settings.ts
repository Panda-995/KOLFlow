import { Router } from 'express';
import db, { generateUniqueApiKey } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { logActivity, getUserId } from './utils/index.js';
import { validateEmail, validatePassword } from './utils/helpers.js';
import { readEncryptedSensitiveBody } from '../services/authEncryptionService.js';
import type { SettingsRow, TableInfoRow } from '../dbRows.js';

const router = Router();

// 密码加密
const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// 验证密码
const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

// 获取设置
router.get('/', (req, res) => {
  const userId = getUserId(req);
  let settings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as SettingsRow | undefined;
  if (!settings) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO settings (id, userId, displayName, email, bio, orderReminder, weeklyReport)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, '博主账号', '', '', 1, 0);
    settings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as SettingsRow | undefined;
  }
  if (!settings) {
    return res.status(500).json({ error: '获取设置失败，请稍后重试' });
  }

  return res.json({
    ...settings,
    orderReminder: Boolean(settings.orderReminder),
    weeklyReport: Boolean(settings.weeklyReport)
  });
});

// 更新设置
router.put('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const { displayName, bio, orderReminder, weeklyReport, avatar, reportFrequency } = req.body;
    if (displayName !== undefined && typeof displayName !== 'string') {
      return res.status(400).json({ error: '昵称格式无效' });
    }
    if (bio !== undefined && typeof bio !== 'string') {
      return res.status(400).json({ error: '个人简介格式无效' });
    }

    const existing = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as SettingsRow | undefined;
  if (!existing) {
    return res.status(404).json({ error: 'Settings not found' });
  }
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email: string } | undefined;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  // 缺省字段保留原值（而不是写成 NULL / 默认值），与导入路径的合并语义一致
  const newAvatar = avatar !== undefined ? avatar : existing.avatar;
  const newDisplayName = displayName !== undefined ? displayName : existing.displayName;
  const newBio = bio !== undefined ? bio : existing.bio;
  const newOrderReminder = orderReminder !== undefined ? (orderReminder ? 1 : 0) : existing.orderReminder;
  const newWeeklyReport = weeklyReport !== undefined ? (weeklyReport ? 1 : 0) : existing.weeklyReport;
  const normalizedFrequency = reportFrequency === 'monthly'
    ? 'monthly'
    : (reportFrequency === 'weekly' ? 'weekly' : (existing.reportFrequency || 'weekly'));

  db.prepare(`
    UPDATE settings
    SET displayName = ?, email = ?, bio = ?, orderReminder = ?, weeklyReport = ?, avatar = ?, reportFrequency = ?
    WHERE userId = ?
  `).run(newDisplayName, user.email, newBio, newOrderReminder, newWeeklyReport, newAvatar, normalizedFrequency, userId);

  const updatedSettings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as SettingsRow | undefined;
  if (!updatedSettings) {
    return res.status(500).json({ error: '更新设置失败，请稍后重试' });
  }

    return res.json({
      ...updatedSettings,
      orderReminder: Boolean(updatedSettings.orderReminder),
      weeklyReport: Boolean(updatedSettings.weeklyReport)
    });
  } catch (error) {
    console.error('更新设置错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: '更新设置失败，请稍后重试' });
  }
});

// 安全设置
router.put('/security', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { email, password, oldPassword } = readEncryptedSensitiveBody(req.body);
    const newEmail = typeof email === 'string' ? email.trim() : '';

    if (!newEmail || !validateEmail(newEmail)) {
      return res.status(400).json({ error: '请输入有效的邮箱地址' });
    }

    const currentUser = db.prepare('SELECT email, password FROM users WHERE id = ?').get(userId) as { email: string; password: string } | undefined;
    if (!currentUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const isChangingEmail = newEmail !== currentUser.email;
    const isChangingPassword = typeof password === 'string' && password.length > 0;
    if (isChangingEmail) {
      // 邮箱是登录凭据：改邮箱同样需要原密码，避免 token 泄露后被永久夺号
      if (!oldPassword || typeof oldPassword !== 'string') {
        return res.status(400).json({ error: '修改邮箱需要输入原密码' });
      }
      const isValidOldPassword = await verifyPassword(oldPassword, currentUser.password);
      if (!isValidOldPassword) {
        return res.status(400).json({ error: '原密码错误' });
      }
    }
    if (isChangingPassword) {
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ error: passwordValidation.message });
      }

      if (!oldPassword || typeof oldPassword !== 'string') {
        return res.status(400).json({ error: '修改密码需要输入原密码' });
      }

      const isValidOldPassword = await verifyPassword(oldPassword, currentUser.password);
      if (!isValidOldPassword) {
        return res.status(400).json({ error: '原密码错误' });
      }
    }

    const hashedPassword = isChangingPassword ? await hashPassword(password) : null;
    const updateSecurity = db.transaction(() => {
      db.prepare('UPDATE settings SET email = ? WHERE userId = ?').run(newEmail, userId);
      if (hashedPassword) {
        // 递增 tokenVersion 撤销所有旧会话，其他设备需重新登录
        db.prepare('UPDATE users SET email = ?, password = ?, tokenVersion = COALESCE(tokenVersion, 0) + 1 WHERE id = ?')
          .run(newEmail, hashedPassword, userId);
        logActivity(userId, 'update_security', 'user', userId, '更新安全设置');
      } else {
        db.prepare('UPDATE users SET email = ? WHERE id = ?').run(newEmail, userId);
      }
    });

    updateSecurity();
    return res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新安全设置失败';
    const isDuplicateEmail = message.includes('UNIQUE');
    const status = isDuplicateEmail || message.includes('认证')
      ? 400
      : (message.includes('未授权') ? 401 : 500);
    return res.status(status).json({
      error: isDuplicateEmail ? '该邮箱已被其他账号使用' : message,
      timestamp: new Date().toISOString(),
    });
  }
});

// 永久注销账号及其全部关联数据
router.delete('/account', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { password } = readEncryptedSensitiveBody(req.body);

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: '请输入当前密码以确认注销账号' });
    }

    const currentUser = db.prepare('SELECT password FROM users WHERE id = ?').get(userId) as { password: string } | undefined;
    if (!currentUser) {
      return res.status(404).json({ error: '用户不存在或账号已注销' });
    }

    const isValidPassword = await verifyPassword(password, currentUser.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: '当前密码错误，无法注销账号' });
    }

    const deleteAccount = db.transaction(() => {
      const userScopedTables = [
        'publish_links',
        'paid_promotions',
        'assets',
        'comments',
        'activity_logs',
        'todos',
        'payments',
        'order_templates',
        'orders',
        'brands',
        'settings',
      ];

      for (const table of userScopedTables) {
        db.prepare(`DELETE FROM ${table} WHERE userId = ?`).run(userId);
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    });

    deleteAccount();
    return res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '账号注销失败';
    const status = message.includes('认证') ? 400 : (message.includes('未授权') ? 401 : 500);
    return res.status(status).json({ error: status === 500 ? '账号注销失败，请稍后重试' : message });
  }
});

// 生成 API Key
router.post('/apikey', (req, res) => {
  const userId = getUserId(req);
  try {
    // 生成 API Key - 24字符安全token
    const newApiKey = generateUniqueApiKey();

    const tableInfo = db.prepare("PRAGMA table_info(settings)").all() as TableInfoRow[];
    const hasApiKeyColumn = tableInfo.some(col => col.name === 'apiKey');

    if (!hasApiKeyColumn) {
      db.prepare("ALTER TABLE settings ADD COLUMN apiKey TEXT").run();
    }

    db.prepare("UPDATE settings SET apiKey = ? WHERE userId = ?").run(newApiKey, userId);

    return res.json({ apiKey: newApiKey });
  } catch (error) {
    console.error('生成 API Key 失败:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: '生成 API Key 失败' });
  }
});

export default router;
