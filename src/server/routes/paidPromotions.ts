import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { getUserId, logActivity } from './utils/index.js';
import { validateAmount } from './utils/helpers.js';

const router = Router();

const normalizePlatform = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const normalizeAmount = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : NaN;
};

router.get('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : '';

    if (orderId) {
      const order = db.prepare('SELECT id FROM orders WHERE id = ? AND userId = ?').get(orderId, userId);
      if (!order) {
        return res.status(404).json({ error: '商单不存在' });
      }

      const records = db.prepare(`
        SELECT * FROM paid_promotions
        WHERE userId = ? AND orderId = ?
        ORDER BY createdAt DESC
      `).all(userId, orderId);
      return res.json(records);
    }

    const records = db.prepare(`
      SELECT * FROM paid_promotions
      WHERE userId = ?
      ORDER BY createdAt DESC
    `).all(userId);
    return res.json(records);
  } catch (error) {
    console.error('获取付费推广记录错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: '获取付费推广记录失败，请稍后重试',
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderId } = req.body;
    const platform = normalizePlatform(req.body.platform);
    const amount = normalizeAmount(req.body.amount);

    if (!orderId) {
      return res.status(400).json({ error: '商单ID不能为空' });
    }

    if (!platform) {
      return res.status(400).json({ error: '推广平台不能为空' });
    }

    if (!validateAmount(amount) || amount <= 0) {
      return res.status(400).json({ error: '推广金额必须大于 0' });
    }

    const order = db.prepare('SELECT id, title FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as any;
    if (!order) {
      return res.status(404).json({ error: '商单不存在' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO paid_promotions (id, orderId, userId, platform, amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, orderId, userId, platform, amount);

    logActivity(userId, 'create', 'paid_promotion', id, `添加付费推广: ${order.title} / ${platform} ¥${amount}`);

    const newRecord = db.prepare('SELECT * FROM paid_promotions WHERE id = ?').get(id);
    return res.json(newRecord);
  } catch (error) {
    console.error('创建付费推广记录错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: '创建付费推广记录失败，请稍后重试' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const record = db.prepare('SELECT * FROM paid_promotions WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (record) {
      logActivity(userId, 'delete', 'paid_promotion', id, `删除付费推广: ${record.platform} ¥${record.amount}`);
    }

    db.prepare('DELETE FROM paid_promotions WHERE id = ? AND userId = ?').run(id, userId);
    return res.json({ success: true });
  } catch (error) {
    console.error('删除付费推广记录错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: '删除付费推广记录失败，请稍后重试',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
