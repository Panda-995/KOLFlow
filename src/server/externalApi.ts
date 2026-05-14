import { Router } from 'express';
import db from './db.js';
import { v4 as uuidv4 } from 'uuid';
import '../types/index.js'; // 加载Express类型扩展
import { getUserIdByApiKey } from './routes/utils/index.js';
import { safeJsonParse } from './routes/utils/helpers.js';
import {
  getOrdersByUserId,
  createOrderWithTodo,
  updateOrderWithSync,
  deleteOrderWithRelated,
  autoCreatePaymentIfCompleted
} from './services/orderService.js';

const router = Router();

// userId验证辅助函数
function getUserId(req: Express.Request): string {
  const userId = req.userId;
  if (!userId) {
    throw new Error('未授权访问');
  }
  return userId;
}

// 认证中间件
router.use((req, res, next) => {
  // 支持 URL 参数认证 (?token=xxx 或 ?key=xxx)
  const urlToken = req.query.token || req.query.key;

  if (urlToken) {
    const userId = getUserIdByApiKey(urlToken as string);
    if (userId) {
      req.userId = userId;
      return next();
    }
    return res.status(401).json({ error: 'Invalid API Key' });
  }

  // 支持 Authorization Header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header or token parameter' });
  }

  const token = authHeader.split(' ')[1];
  const userId = getUserIdByApiKey(token);

  if (!userId) {
    return res.status(401).json({ error: 'Invalid API Key' });
  }

  req.userId = userId;
  next();
});

// ==================== Orders ====================

router.get('/orders', async (req, res) => {
  try {
    const userId = getUserId(req);
    const orders = getOrdersByUserId(userId);
    return res.json(orders);
  } catch (error) {
    console.error('externalApi GET /orders失败:', error);
    return res.status(500).json({
      error: '获取商单失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/orders', (req, res) => {
  try {
    const userId = getUserId(req);
    const { title, type, actualAmount, brandName, platforms, acceptDate, submitDate } = req.body;

    const newOrder = createOrderWithTodo(userId, {
      title,
      type,
      actualAmount,
      brandName,
      platforms,
      acceptDate,
      submitDate
    });

    return res.json(newOrder);
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建商单失败';
    return res.status(400).json({ error: message });
  }
});

router.put('/orders/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { status, title, type, actualAmount, brandName, platforms, acceptDate, submitDate } = req.body;

    const updatedOrder = updateOrderWithSync(userId, id, {
      status,
      title,
      type,
      actualAmount,
      brandName,
      platforms,
      acceptDate,
      submitDate
    });

    autoCreatePaymentIfCompleted(updatedOrder, userId);

    return res.json(updatedOrder);
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新商单失败';
    return res.status(400).json({ error: message });
  }
});

router.delete('/orders/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const result = deleteOrderWithRelated(userId, id);
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除商单失败';
    return res.status(400).json({ error: message });
  }
});

// ==================== Todos ====================

router.get('/todos', async (req, res) => {
  try {
    const userId = req.userId;
    const todos = db.prepare('SELECT * FROM todos WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    return res.json(todos.map((t: any) => ({ ...t, completed: Boolean(t.completed) })));
  } catch (error) {
    console.error('externalApi GET /todos失败:', error);
    return res.status(500).json({
      error: '获取待办失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/todos', async (req, res) => {
  try {
    const userId = req.userId;
    const { content, priority, dueDate, orderId, brandId, category } = req.body;
    const id = uuidv4();
    db.prepare(`
      INSERT INTO todos (id, userId, content, priority, completed, dueDate, orderId, brandId, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, content, priority || 'medium', 0, dueDate || null, orderId || null, brandId || null, category || null);

    const newTodo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    newTodo.completed = Boolean(newTodo.completed);
    return res.json(newTodo);
  } catch (error) {
    console.error('externalApi POST /todos失败:', error);
    return res.status(500).json({
      error: '创建待办失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.put('/todos/:id', async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { content, priority, completed, dueDate } = req.body;

    const existingTodo = db.prepare('SELECT * FROM todos WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (!existingTodo) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    const newContent = content || existingTodo.content;
    const newPriority = priority || existingTodo.priority;
    const newCompleted = completed !== undefined ? (completed ? 1 : 0) : existingTodo.completed;
    const newDueDate = dueDate !== undefined ? dueDate : existingTodo.dueDate;

    db.prepare(`
      UPDATE todos
      SET content = ?, priority = ?, completed = ?, dueDate = ?
      WHERE id = ?
    `).run(newContent, newPriority, newCompleted, newDueDate, id);

    const updatedTodo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    updatedTodo.completed = Boolean(updatedTodo.completed);
    return res.json(updatedTodo);
  } catch (error) {
    console.error('externalApi PUT /todos/:id失败:', error);
    return res.status(500).json({
      error: '更新待办失败',
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== Payments ====================

router.get('/payments', async (req, res) => {
  try {
    const userId = req.userId;
    const payments = db.prepare('SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    return res.json(payments);
  } catch (error) {
    console.error('externalApi GET /payments失败:', error);
    return res.status(500).json({
      error: '获取款项失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/payments', async (req, res) => {
  try {
    const userId = req.userId;
    const { orderNo, brand, amount, type, date, method } = req.body;
    const id = uuidv4();

    db.prepare(`
      INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, orderNo || null, brand || '', amount || 0, type || 'pending', date || '', method || '');

    const newPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    return res.json(newPayment);
  } catch (error) {
    console.error('externalApi POST /payments失败:', error);
    return res.status(500).json({
      error: '创建款项失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.put('/payments/:id', async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { orderNo, brand, amount, type, date, method } = req.body;

    const existing = db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    db.prepare(`
      UPDATE payments SET orderNo = ?, brand = ?, amount = ?, type = ?, date = ?, method = ?
      WHERE id = ?
    `).run(orderNo || existing.orderNo, brand || existing.brand, amount || existing.amount, type || existing.type, date || existing.date, method || existing.method, id);

    const updated = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
    return res.json(updated);
  } catch (error) {
    console.error('externalApi PUT /payments/:id失败:', error);
    return res.status(500).json({
      error: '更新款项失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.delete('/payments/:id', async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    db.prepare('DELETE FROM payments WHERE id = ? AND userId = ?').run(id, userId);
    return res.json({ success: true });
  } catch (error) {
    console.error('externalApi DELETE /payments/:id失败:', error);
    return res.status(500).json({
      error: '删除款项失败',
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== Brands ====================

router.get('/brands', async (req, res) => {
  try {
    const userId = req.userId;
    const brands = db.prepare('SELECT * FROM brands WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    return res.json(brands);
  } catch (error) {
    console.error('externalApi GET /brands失败:', error);
    return res.status(500).json({
      error: '获取品牌失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/brands', async (req, res) => {
  try {
    const userId = req.userId;
    const { name, industry, contact, phone, contacts } = req.body;
    const id = uuidv4();

    const contactsJson = contacts && contacts.length > 0
      ? JSON.stringify(contacts)
      : (contact || phone ? JSON.stringify([{ id: uuidv4(), name: contact || '', phone: phone || '', note: '' }]) : null);

    db.prepare(`
      INSERT INTO brands (id, userId, name, industry, contact, phone, contacts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, name, industry || '', contact || '', phone || '', contactsJson);

    const newBrand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as any;
    newBrand.contacts = newBrand.contacts ? JSON.parse(newBrand.contacts) : [];
    return res.json(newBrand);
  } catch (error) {
    console.error('externalApi POST /brands失败:', error);
    return res.status(500).json({
      error: '创建品牌失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.put('/brands/:id', async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { name, industry, contact, phone, contacts } = req.body;

    const existing = db.prepare('SELECT * FROM brands WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (!existing) {
      return res.status(404).json({ error: 'Brand not found' });
    }

    const newContacts = contacts !== undefined
      ? (contacts.length > 0 ? JSON.stringify(contacts) : null)
      : existing.contacts;

    db.prepare(`
      UPDATE brands SET name = ?, industry = ?, contact = ?, phone = ?, contacts = ?
      WHERE id = ?
    `).run(
      name !== undefined ? name : existing.name,
      industry !== undefined ? industry : existing.industry,
      contact !== undefined ? contact : existing.contact,
      phone !== undefined ? phone : existing.phone,
      newContacts,
      id
    );

    const updated = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as any;
    updated.contacts = updated.contacts ? JSON.parse(updated.contacts) : [];
    return res.json(updated);
  } catch (error) {
    console.error('externalApi PUT /brands/:id失败:', error);
    return res.status(500).json({
      error: '更新品牌失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.delete('/brands/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const brand = db.prepare('SELECT name FROM brands WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (!brand) {
      res.status(404).json({ error: 'Brand not found' });
      return;
    }

    const deleteBrand = db.transaction(() => {
      db.prepare('UPDATE orders SET brandName = NULL WHERE brandName = ? AND userId = ?').run(brand.name, userId);
      db.prepare('UPDATE todos SET category = NULL, brandId = NULL WHERE (brandId = ? OR category = ?) AND userId = ?').run(id, brand.name, userId);
      db.prepare('UPDATE payments SET brand = ? WHERE brand = ? AND userId = ?').run(`已删除品牌(${brand.name})`, brand.name, userId);
      db.prepare('DELETE FROM brands WHERE id = ? AND userId = ?').run(id, userId);
    });

    deleteBrand();
    return res.json({ success: true });
  } catch (error) {
    console.error('externalApi DELETE /brands/:id失败:', error);
    return res.status(500).json({
      error: '删除品牌失败',
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== Statistics ====================

router.get('/statistics', async (req, res) => {
  try {
    const userId = req.userId;
    const orders = db.prepare('SELECT * FROM orders WHERE userId = ?').all(userId) as any[];
    const payments = db.prepare('SELECT * FROM payments WHERE userId = ?').all(userId) as any[];
    const todos = db.prepare('SELECT * FROM todos WHERE userId = ?').all(userId) as any[];
    const assets = db.prepare("SELECT * FROM assets WHERE userId = ? AND saleStatus = 'sold'").all(userId) as any[];

    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;

    const paymentIncome = payments.filter(p => p.type === 'settled').reduce((sum, p) => sum + p.amount, 0);
    const assetIncome = assets.reduce((sum, a) => sum + (a.soldAmount || 0), 0);
    const totalIncome = paymentIncome + assetIncome;
    const pendingIncome = payments.filter(p => p.type === 'pending').reduce((sum, p) => sum + p.amount, 0);

    const pendingTodos = todos.filter(t => !t.completed).length;

    return res.json({
      orders: {
        total: totalOrders,
        completed: completedOrders,
        inProgress: orders.filter(o => o.status === 'in_progress').length,
        cancelled: orders.filter(o => o.status === 'cancelled').length
      },
      income: {
        totalReceived: totalIncome,
        totalPending: pendingIncome
      },
      todos: {
        pending: pendingTodos
      }
    });
  } catch (error) {
    console.error('externalApi GET /statistics失败:', error);
    return res.status(500).json({
      error: '获取统计失败',
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== Publish Links ====================

router.get('/publish-links/:orderId', async (req, res) => {
  try {
    const userId = req.userId;
    const { orderId } = req.params;
    const links = db.prepare('SELECT * FROM publish_links WHERE orderId = ? AND userId = ? ORDER BY createdAt DESC').all(orderId, userId);
    return res.json(links);
  } catch (error) {
    console.error('externalApi GET /publish-links/:orderId失败:', error);
    return res.status(500).json({
      error: '获取发布链接失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/publish-links', async (req, res) => {
  try {
    const userId = req.userId;
    const { orderId, platform, url } = req.body;
    const id = uuidv4();

    db.prepare(`
      INSERT INTO publish_links (id, orderId, userId, platform, url)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, orderId, userId, platform || '其他', url);

    const newLink = db.prepare('SELECT * FROM publish_links WHERE id = ?').get(id);
    return res.json(newLink);
  } catch (error) {
    console.error('externalApi POST /publish-links失败:', error);
    return res.status(500).json({
      error: '创建发布链接失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.delete('/publish-links/:id', async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    db.prepare('DELETE FROM publish_links WHERE id = ? AND userId = ?').run(id, userId);
    return res.json({ success: true });
  } catch (error) {
    console.error('externalApi DELETE /publish-links/:id失败:', error);
    return res.status(500).json({
      error: '删除发布链接失败',
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== Settings ====================

router.get('/settings', async (req, res) => {
  try {
    const userId = req.userId;
    const settings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as any;
    if (!settings) {
      return res.json({ displayName: '博主账号', email: '', bio: '' });
    }
    return res.json({
      displayName: settings.displayName,
      email: settings.email,
      bio: settings.bio,
      orderReminder: Boolean(settings.orderReminder),
      weeklyReport: Boolean(settings.weeklyReport)
    });
  } catch (error) {
    console.error('externalApi GET /settings失败:', error);
    return res.status(500).json({
      error: '获取设置失败',
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== Logs ====================

router.get('/logs', async (req, res) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = db.prepare('SELECT * FROM activity_logs WHERE userId = ? ORDER BY createdAt DESC LIMIT ?').all(userId, limit);
    return res.json(logs);
  } catch (error) {
    console.error('externalApi GET /logs失败:', error);
    return res.status(500).json({
      error: '获取日志失败',
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== Export ====================

router.get('/export', async (req, res) => {
  try {
    const userId = req.userId;
    const orders = db.prepare('SELECT * FROM orders WHERE userId = ?').all(userId) as any[];
    const brands = db.prepare('SELECT * FROM brands WHERE userId = ?').all(userId) as any[];
    const payments = db.prepare('SELECT * FROM payments WHERE userId = ?').all(userId) as any[];
    const todos = db.prepare('SELECT * FROM todos WHERE userId = ?').all(userId) as any[];
    const settings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as any;
    const publishLinks = db.prepare('SELECT * FROM publish_links WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const comments = db.prepare('SELECT * FROM comments WHERE userId = ? ORDER BY createdAt DESC').all(userId);

    return res.json({
      orders: orders.map(o => ({ ...o, platforms: safeJsonParse(o.platforms, []) })),
      brands,
      payments,
      todos: todos.map(t => ({ ...t, completed: Boolean(t.completed) })),
      settings: {
        displayName: settings?.displayName || '博主账号',
        email: settings?.email || '',
        bio: settings?.bio || ''
      },
      publishLinks,
      comments
    });
  } catch (error) {
    console.error('externalApi GET /export失败:', error);
    return res.status(500).json({
      error: '导出数据失败',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
