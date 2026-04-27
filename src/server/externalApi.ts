import { Router } from 'express';
import db from './db.js';
import { v4 as uuidv4 } from 'uuid';
import { getUserIdByApiKey, generateSecureRandom } from './routes/utils/index.js';
import { safeJsonParse, generateOrderNo } from './routes/utils/helpers.js';
import {
  getOrdersByUserId,
  createOrderWithTodo,
  updateOrderWithSync,
  deleteOrderWithRelated,
  autoCreatePaymentIfCompleted
} from './services/orderService.js';

const router = Router();

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

router.get('/orders', (req, res) => {
  const userId = (req as any).userId;
  const orders = getOrdersByUserId(userId);
  res.json(orders);
});

router.post('/orders', (req, res) => {
  try {
    const userId = (req as any).userId;
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

    res.json(newOrder);
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建商单失败';
    res.status(400).json({ error: message });
  }
});

router.put('/orders/:id', (req, res) => {
  try {
    const userId = (req as any).userId;
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

    res.json(updatedOrder);
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新商单失败';
    res.status(400).json({ error: message });
  }
});

router.delete('/orders/:id', (req, res) => {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const result = deleteOrderWithRelated(userId, id);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除商单失败';
    res.status(400).json({ error: message });
  }
});

// ==================== Todos ====================

router.get('/todos', (req, res) => {
  const userId = (req as any).userId;
  const todos = db.prepare('SELECT * FROM todos WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  res.json(todos.map((t: any) => ({ ...t, completed: Boolean(t.completed) })));
});

router.post('/todos', (req, res) => {
  const userId = (req as any).userId;
  const { content, priority, dueDate, orderId, brandId, category } = req.body;
  const id = uuidv4();
  db.prepare(`
    INSERT INTO todos (id, userId, content, priority, completed, dueDate, orderId, brandId, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, content, priority || 'medium', 0, dueDate || null, orderId || null, brandId || null, category || null);

  const newTodo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
  newTodo.completed = Boolean(newTodo.completed);
  res.json(newTodo);
});

router.put('/todos/:id', (req, res) => {
  const userId = (req as any).userId;
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
  res.json(updatedTodo);
});

// ==================== Payments ====================

router.get('/payments', (req, res) => {
  const userId = (req as any).userId;
  const payments = db.prepare('SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  res.json(payments);
});

router.post('/payments', (req, res) => {
  const userId = (req as any).userId;
  const { orderNo, brand, amount, type, date, method } = req.body;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, orderNo || null, brand || '', amount || 0, type || 'pending', date || '', method || '');

  const newPayment = db.prepare('SELECT * FROM payments WHERE id = ?').get(id) as any;
  res.json(newPayment);
});

router.put('/payments/:id', (req, res) => {
  const userId = (req as any).userId;
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
  res.json(updated);
});

router.delete('/payments/:id', (req, res) => {
  const userId = (req as any).userId;
  const { id } = req.params;
  db.prepare('DELETE FROM payments WHERE id = ? AND userId = ?').run(id, userId);
  res.json({ success: true });
});

// ==================== Brands ====================

router.get('/brands', (req, res) => {
  const userId = (req as any).userId;
  const brands = db.prepare('SELECT * FROM brands WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  res.json(brands);
});

router.post('/brands', (req, res) => {
  const userId = (req as any).userId;
  const { name, industry, contact, phone } = req.body;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO brands (id, userId, name, industry, contact, phone)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, name, industry || '', contact || '', phone || '');

  const newBrand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as any;
  res.json(newBrand);
});

router.put('/brands/:id', (req, res) => {
  const userId = (req as any).userId;
  const { id } = req.params;
  const { name, industry, contact, phone } = req.body;

  const existing = db.prepare('SELECT * FROM brands WHERE id = ? AND userId = ?').get(id, userId) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Brand not found' });
  }

  db.prepare(`
    UPDATE brands SET name = ?, industry = ?, contact = ?, phone = ?
    WHERE id = ?
  `).run(name || existing.name, industry || existing.industry, contact || existing.contact, phone || existing.phone, id);

  const updated = db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as any;
  res.json(updated);
});

router.delete('/brands/:id', (req, res) => {
  const userId = (req as any).userId;
  const { id } = req.params;
  db.prepare('DELETE FROM brands WHERE id = ? AND userId = ?').run(id, userId);
  res.json({ success: true });
});

// ==================== Statistics ====================

router.get('/statistics', (req, res) => {
  const userId = (req as any).userId;
  const orders = db.prepare('SELECT * FROM orders WHERE userId = ?').all(userId) as any[];
  const payments = db.prepare('SELECT * FROM payments WHERE userId = ?').all(userId) as any[];
  const todos = db.prepare('SELECT * FROM todos WHERE userId = ?').all(userId) as any[];

  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.status === 'completed').length;

  const totalIncome = payments.filter(p => p.type === 'settled').reduce((sum, p) => sum + p.amount, 0);
  const pendingIncome = payments.filter(p => p.type === 'pending').reduce((sum, p) => sum + p.amount, 0);

  const pendingTodos = todos.filter(t => !t.completed).length;

  res.json({
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
});

// ==================== Publish Links ====================

router.get('/publish-links/:orderId', (req, res) => {
  const userId = (req as any).userId;
  const { orderId } = req.params;
  const links = db.prepare('SELECT * FROM publish_links WHERE orderId = ? AND userId = ? ORDER BY createdAt DESC').all(orderId, userId);
  res.json(links);
});

router.post('/publish-links', (req, res) => {
  const userId = (req as any).userId;
  const { orderId, platform, url } = req.body;
  const id = uuidv4();

  db.prepare(`
    INSERT INTO publish_links (id, orderId, userId, platform, url)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, orderId, userId, platform || '其他', url);

  const newLink = db.prepare('SELECT * FROM publish_links WHERE id = ?').get(id);
  res.json(newLink);
});

router.delete('/publish-links/:id', (req, res) => {
  const userId = (req as any).userId;
  const { id } = req.params;
  db.prepare('DELETE FROM publish_links WHERE id = ? AND userId = ?').run(id, userId);
  res.json({ success: true });
});

// ==================== Settings ====================

router.get('/settings', (req, res) => {
  const userId = (req as any).userId;
  const settings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as any;
  if (!settings) {
    return res.json({ displayName: '博主账号', email: '', bio: '' });
  }
  res.json({
    displayName: settings.displayName,
    email: settings.email,
    bio: settings.bio,
    orderReminder: Boolean(settings.orderReminder),
    weeklyReport: Boolean(settings.weeklyReport)
  });
});

// ==================== Logs ====================

router.get('/logs', (req, res) => {
  const userId = (req as any).userId;
  const limit = parseInt(req.query.limit as string) || 100;
  const logs = db.prepare('SELECT * FROM activity_logs WHERE userId = ? ORDER BY createdAt DESC LIMIT ?').all(userId, limit);
  res.json(logs);
});

// ==================== Export ====================

router.get('/export', (req, res) => {
  const userId = (req as any).userId;
  const orders = db.prepare('SELECT * FROM orders WHERE userId = ?').all(userId) as any[];
  const brands = db.prepare('SELECT * FROM brands WHERE userId = ?').all(userId) as any[];
  const payments = db.prepare('SELECT * FROM payments WHERE userId = ?').all(userId) as any[];
  const todos = db.prepare('SELECT * FROM todos WHERE userId = ?').all(userId) as any[];
  const settings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as any;
  const publishLinks = db.prepare('SELECT * FROM publish_links WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  const comments = db.prepare('SELECT * FROM comments WHERE userId = ? ORDER BY createdAt DESC').all(userId);

  res.json({
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
});

export default router;