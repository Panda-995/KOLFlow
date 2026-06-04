import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { logActivity, getUserId, generateSecureRandom } from './utils/index.js';
import { validateEmail, validatePassword } from './utils/helpers.js';

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
  let settings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as any;
  if (!settings) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO settings (id, userId, displayName, email, bio, orderReminder, weeklyReport)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, '博主账号', '', '', 1, 0);
    settings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
  }

  return res.json({
    ...settings,
    orderReminder: Boolean(settings.orderReminder),
    weeklyReport: Boolean(settings.weeklyReport)
  });
});

// 更新设置
router.put('/', (req, res) => {
  const userId = getUserId(req);
  const { displayName, email, bio, orderReminder, weeklyReport, avatar } = req.body;

  const existing = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Settings not found' });
  }
  const newAvatar = avatar !== undefined ? avatar : existing.avatar;

  db.prepare(`
    UPDATE settings
    SET displayName = ?, email = ?, bio = ?, orderReminder = ?, weeklyReport = ?, avatar = ?
    WHERE userId = ?
  `).run(displayName, email, bio, orderReminder ? 1 : 0, weeklyReport ? 1 : 0, newAvatar, userId);

  const updatedSettings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as any;

  return res.json({
    ...updatedSettings,
    orderReminder: Boolean(updatedSettings.orderReminder),
    weeklyReport: Boolean(updatedSettings.weeklyReport)
  });
});

// 安全设置
router.put('/security', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { email, password, oldPassword } = req.body;
    const newEmail = typeof email === 'string' ? email.trim() : '';

    if (!newEmail || !validateEmail(newEmail)) {
      return res.status(400).json({ error: '请输入有效的邮箱地址' });
    }

    const currentUser = db.prepare('SELECT email, password FROM users WHERE id = ?').get(userId) as any;
    if (!currentUser) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const isChangingPassword = typeof password === 'string' && password.length > 0;
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
        db.prepare('UPDATE users SET email = ?, password = ? WHERE id = ?').run(newEmail, hashedPassword, userId);
        logActivity(userId, 'update_security', 'user', userId, '更新安全设置');
      } else {
        db.prepare('UPDATE users SET email = ? WHERE id = ?').run(newEmail, userId);
      }
    });

    updateSecurity();
    return res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新安全设置失败';
    const status = message.includes('UNIQUE') ? 400 : (message.includes('未授权') ? 401 : 500);
    return res.status(status).json({
      error: status === 400 ? '该邮箱已被其他账号使用' : message,
      timestamp: new Date().toISOString(),
    });
  }
});

// 生成 API Key
router.post('/apikey', (req, res) => {
  const userId = getUserId(req);
  try {
    // 生成 API Key - 24字符安全token
    const newApiKey = generateSecureRandom(24);

    const tableInfo = db.prepare("PRAGMA table_info(settings)").all() as any[];
    const hasApiKeyColumn = tableInfo.some(col => col.name === 'apiKey');

    if (!hasApiKeyColumn) {
      db.prepare("ALTER TABLE settings ADD COLUMN apiKey TEXT").run();
    }

    db.prepare("UPDATE settings SET apiKey = ? WHERE userId = ?").run(newApiKey, userId);

    res.json({ apiKey: newApiKey });
  } catch (error) {
    res.status(500).json({
      error: '生成 API Key 失败',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// 显示设置
router.put('/display', (req, res) => {
  const userId = getUserId(req);
  const { darkMode, reportFrequency } = req.body;

  db.prepare(`
    UPDATE settings
    SET darkMode = ?, reportFrequency = ?
    WHERE userId = ?
  `).run(darkMode ? 1 : 0, reportFrequency || 'weekly', userId);

  const updatedSettings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as any;

  res.json({
    ...updatedSettings,
    orderReminder: Boolean(updatedSettings.orderReminder),
    weeklyReport: Boolean(updatedSettings.weeklyReport),
    darkMode: Boolean(updatedSettings.darkMode)
  });
});

export default router;
