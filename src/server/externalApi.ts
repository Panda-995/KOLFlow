import { Router } from 'express';
import db from './db.js';
import '../types/index.js'; // 加载Express类型扩展
import { getUserIdByApiKey } from './routes/utils/index.js';
import { safeJsonParse } from './routes/utils/helpers.js';
import {
  getOrdersByUserId,
  createOrderWithTodo,
  updateOrderWithSync,
  deleteOrderWithRelated
} from './services/orderService.js';
import { createBrand, deleteBrand, listBrands, updateBrand } from './services/brandService.js';
import { getApiErrorMessage, getApiErrorStatus } from './services/errors.js';
import { createPayment, deletePaymentRecord, listPayments, updatePaymentRecord } from './services/paymentService.js';
import { createTodo, listTodos, updateTodo } from './services/todoService.js';
import { createPublishLink, deletePublishLink, listPublishLinks } from './services/publishLinkService.js';

const router = Router();
const BACKUP_VERSION = 2;

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
    const { title, type, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue, operationDate } = req.body;

    const newOrder = createOrderWithTodo(userId, {
      title,
      type,
      actualAmount,
      brandName,
      platforms,
      acceptDate,
      submitDate,
      productName,
      productValue,
      operationDate
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
    const { status, title, type, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue, operationDate } = req.body;

    const updatedOrder = updateOrderWithSync(userId, id, {
      status,
      title,
      type,
      actualAmount,
      brandName,
      platforms,
      acceptDate,
      submitDate,
      productName,
      productValue,
      operationDate
    });

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
    return res.json(listTodos(getUserId(req)));
  } catch (error) {
    console.error('externalApi GET /todos失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '获取待办失败') });
  }
});

router.post('/todos', async (req, res) => {
  try {
    return res.json(createTodo(getUserId(req), req.body));
  } catch (error) {
    console.error('externalApi POST /todos失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '创建待办失败') });
  }
});

router.put('/todos/:id', async (req, res) => {
  try {
    return res.json(updateTodo(getUserId(req), req.params.id, req.body));
  } catch (error) {
    console.error('externalApi PUT /todos/:id失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '更新待办失败') });
  }
});

// ==================== Payments ====================

router.get('/payments', async (req, res) => {
  try {
    return res.json(listPayments(getUserId(req)));
  } catch (error) {
    console.error('externalApi GET /payments失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '获取款项失败') });
  }
});

router.post('/payments', async (req, res) => {
  try {
    return res.json(createPayment(getUserId(req), req.body));
  } catch (error) {
    console.error('externalApi POST /payments失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '创建款项失败') });
  }
});

router.put('/payments/:id', async (req, res) => {
  try {
    return res.json(updatePaymentRecord(getUserId(req), req.params.id, req.body));
  } catch (error) {
    console.error('externalApi PUT /payments/:id失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '更新款项失败') });
  }
});

router.delete('/payments/:id', async (req, res) => {
  try {
    return res.json(deletePaymentRecord(getUserId(req), req.params.id));
  } catch (error) {
    console.error('externalApi DELETE /payments/:id失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '删除款项失败') });
  }
});

// ==================== Brands ====================

router.get('/brands', async (req, res) => {
  try {
    return res.json(listBrands(getUserId(req)));
  } catch (error) {
    console.error('externalApi GET /brands失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '获取品牌失败') });
  }
});

router.post('/brands', async (req, res) => {
  try {
    return res.json(createBrand(getUserId(req), req.body));
  } catch (error) {
    console.error('externalApi POST /brands失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '创建品牌失败') });
  }
});

router.put('/brands/:id', async (req, res) => {
  try {
    return res.json(updateBrand(getUserId(req), req.params.id, req.body));
  } catch (error) {
    console.error('externalApi PUT /brands/:id失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '更新品牌失败') });
  }
});

router.delete('/brands/:id', async (req, res) => {
  try {
    return res.json(deleteBrand(getUserId(req), req.params.id));
  } catch (error) {
    console.error('externalApi DELETE /brands/:id失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '删除品牌失败') });
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
    const paidPromotions = db.prepare('SELECT * FROM paid_promotions WHERE userId = ?').all(userId) as any[];

    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'completed').length;

    const paymentIncome = payments.filter(p => p.type === 'settled').reduce((sum, p) => sum + p.amount, 0);
    const assetIncome = assets.reduce((sum, a) => sum + (a.soldAmount || 0), 0);
    const totalIncome = paymentIncome + assetIncome;
    const pendingIncome = payments.filter(p => p.type === 'pending').reduce((sum, p) => sum + p.amount, 0);
    const paidPromotionTotal = paidPromotions.reduce((sum, record) => sum + (record.amount || 0), 0);

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
        totalPending: pendingIncome,
        paidPromotionTotal
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
    return res.json(listPublishLinks(getUserId(req), req.params.orderId));
  } catch (error) {
    console.error('externalApi GET /publish-links/:orderId失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '获取发布链接失败') });
  }
});

router.post('/publish-links', async (req, res) => {
  try {
    return res.json(createPublishLink(getUserId(req), req.body));
  } catch (error) {
    console.error('externalApi POST /publish-links失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '创建发布链接失败') });
  }
});

router.delete('/publish-links/:id', async (req, res) => {
  try {
    return res.json(deletePublishLink(getUserId(req), req.params.id));
  } catch (error) {
    console.error('externalApi DELETE /publish-links/:id失败:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '删除发布链接失败') });
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
    const paidPromotions = db.prepare('SELECT * FROM paid_promotions WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const comments = db.prepare('SELECT * FROM comments WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const assets = db.prepare('SELECT * FROM assets WHERE userId = ? ORDER BY createdAt DESC').all(userId);

    return res.json({
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
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
      paidPromotions,
      comments,
      assets
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
