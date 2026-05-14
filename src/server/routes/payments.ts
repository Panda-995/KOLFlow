import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logActivity, getUserId } from './utils/index.js';
import { validateAmount } from './utils/helpers.js';

const router = Router();

// 获取所有账单
router.get('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const payments = db.prepare('SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    return res.json(payments);
  } catch (error) {
    console.error('获取账单列表错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '获取账单列表失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

// 创建账单
router.post('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderNo, brand, amount, type, date, method } = req.body;

    if (!validateAmount(amount)) {
      return res.status(400).json({ error: '金额数值无效' });
    }
    if (!brand || brand.trim().length === 0) {
      return res.status(400).json({ error: '品牌名称不能为空' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, orderNo || null, brand.trim(), amount || 0, type || 'pending', date || null, method || null);

    logActivity(userId, 'create', 'payment', id, `创建账单: ${brand} ¥${amount}`);

    const newPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    return res.json(newPayment);
  } catch (error) {
    console.error('创建账单错误:', error);
    return res.status(500).json({ error: '创建账单失败，请稍后重试' });
  }
});

// 结算账单
router.put('/:id/settle', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?').get(id, userId) as any;

    if (!payment) {
      return res.status(404).json({ error: '账单不存在' });
    }

    const newType = payment.type === 'pending' ? 'settled' : 'pending';
    const newDate = newType === 'settled' ? new Date().toISOString().split('T')[0] : payment.date;
    const newMethod = newType === 'settled' ? '已结算' : payment.method;

    db.prepare('UPDATE payments SET type = ?, date = ?, method = ? WHERE id = ? AND userId = ?')
      .run(newType, newDate, newMethod, id, userId);

    logActivity(userId, 'settle', 'payment', id, `账单结算: ${payment.brand} ¥${payment.amount} (${payment.type} → ${newType})`);

    const updatedPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    return res.json(updatedPayment);
  } catch (error) {
    console.error('结算账单错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '结算账单失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

// 更新账单
router.put('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { orderNo, brand, amount, type, date, method } = req.body;

    const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (!payment) {
      return res.status(404).json({ error: '账单不存在' });
    }

    if (amount !== undefined && !validateAmount(amount)) {
      return res.status(400).json({ error: '金额数值无效' });
    }

    const newOrderNo = orderNo !== undefined ? orderNo : payment.orderNo;
    const newBrand = brand !== undefined ? brand : payment.brand;
    const newAmount = amount !== undefined ? amount : payment.amount;
    const newType = type !== undefined ? type : payment.type;
    const newDate = date !== undefined ? date : payment.date;
    const newMethod = method !== undefined ? method : payment.method;

    db.prepare(`
      UPDATE payments
      SET orderNo = ?, brand = ?, amount = ?, type = ?, date = ?, method = ?
      WHERE id = ? AND userId = ?
    `).run(newOrderNo, newBrand, newAmount, newType, newDate, newMethod, id, userId);

    logActivity(userId, 'update', 'payment', id, `更新账单: ${newBrand || '未知品牌'} ¥${newAmount}`);

    const updatedPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
    return res.json(updatedPayment);
  } catch (error) {
    console.error('更新账单错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '更新账单失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

// 删除账单
router.delete('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (!payment) {
      return res.status(404).json({ error: '账单不存在' });
    }

    logActivity(userId, 'delete', 'payment', id, `删除账单: ${payment.brand} ¥${payment.amount}`);
    db.prepare('DELETE FROM payments WHERE id = ? AND userId = ?').run(id, userId);
    return res.json({ success: true });
  } catch (error) {
    console.error('删除账单错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '删除账单失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;