import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { readSheet } from 'read-excel-file/node';
import { parse as parseCsv } from 'csv-parse/sync';
import { logActivity, getUserId } from './utils/index.js';
import { EXCEL_FIELD_MAP, ORDER_TYPE_MAP, ORDER_STATUS_MAP } from './utils/constants.js';
import { generateOrderNo, safeJsonParse } from './utils/helpers.js';

// Multer 文件过滤器
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 限制
  },
  fileFilter: (_req, file, cb) => {
    // 只允许当前安全解析链路支持的文件格式。
    const allowedExt = ['.xlsx', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传 .xlsx 或 .csv 文件'));
    }
  }
});
const router = Router();

type ImportRow = Record<string, unknown>;

const normalizeCellValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  return value ?? '';
};

const rowsToObjects = (rows: unknown[][]): ImportRow[] => {
  const headerIndex = rows.findIndex(row => row.some(cell => String(cell ?? '').trim()));
  if (headerIndex === -1) return [];

  const headers = rows[headerIndex].map(cell => String(cell ?? '').trim());

  return rows.slice(headerIndex + 1)
    .map(row => {
      const item: ImportRow = {};
      headers.forEach((header, index) => {
        if (header) item[header] = normalizeCellValue(row[index]);
      });
      return item;
    })
    .filter(row => Object.values(row).some(value => String(value ?? '').trim()));
};

const parseUploadedOrderFile = async (file: Express.Multer.File): Promise<ImportRow[]> => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.csv') {
    return parseCsv(fs.readFileSync(file.path), {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as ImportRow[];
  }

  if (ext === '.xlsx') {
    const rows = await readSheet(file.path);
    return rowsToObjects(rows);
  }

  throw new Error('不支持的文件格式');
};

const requireAuth = (req: any, res: any, next: any) => {
  try {
    getUserId(req);
    next();
  } catch {
    res.status(401).json({ error: '未授权访问，请先登录' });
  }
};

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = safeJsonParse<unknown>(trimmed, null);
  if (Array.isArray(parsed)) {
    return parsed.map(item => String(item).trim()).filter(Boolean);
  }

  return trimmed.split(/[,，、\n]/).map(item => item.trim()).filter(Boolean);
};

const normalizePaymentType = (type: unknown): string => {
  if (type === 'settled' || type === 'pending') return type;
  if (type === 'received') return 'settled';
  return 'pending';
};

// 导出数据
router.get('/export', (req, res) => {
  try {
    const userId = getUserId(req);
    
    const orders = db.prepare('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const brands = db.prepare('SELECT * FROM brands WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const payments = db.prepare('SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const todos = db.prepare('SELECT * FROM todos WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const settings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
    const publishLinks = db.prepare('SELECT * FROM publish_links WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const paidPromotions = db.prepare('SELECT * FROM paid_promotions WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const comments = db.prepare('SELECT * FROM comments WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const assets = db.prepare('SELECT * FROM assets WHERE userId = ? ORDER BY createdAt DESC').all(userId);

    return res.json({
      orders: orders.map((o: any) => ({ ...o, platforms: safeJsonParse(o.platforms, []) })),
      brands,
      payments,
      todos: todos.map((t: any) => ({ ...t, completed: Boolean(t.completed) })),
      settings,
      publishLinks,
      paidPromotions,
      comments,
      assets
    });
  } catch (error) {
    console.error('导出数据错误:', error);
    return res.status(500).json({ error: '导出数据失败，请稍后重试' });
  }
});

// 清空数据
router.post('/clear', (req, res) => {
  try {
    const userId = getUserId(req);

    const clearUserData = db.transaction(() => {
      // 先删除依赖表的数据
      db.prepare('DELETE FROM comments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM paid_promotions WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM publish_links WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM activity_logs WHERE userId = ?').run(userId);
      // 再删除主表数据
      db.prepare('DELETE FROM orders WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM todos WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM brands WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM payments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM assets WHERE userId = ?').run(userId);
    });

    // 禁用外键约束以便安全删除数据；无论事务是否失败都必须恢复。
    db.pragma('foreign_keys = OFF');
    try {
      clearUserData();
    } finally {
      db.pragma('foreign_keys = ON');
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('清空数据错误:', error);
    return res.status(500).json({ error: '清空数据失败，请稍后重试' });
  }
});

// 导入数据
router.post('/import', (req, res) => {
  try {
    const userId = getUserId(req);
    const { orders, brands, payments, todos, settings: importedSettings, publishLinks, paidPromotions, comments, assets } = req.body;

    // 使用事务确保数据一致性
    const importData = db.transaction(() => {
      // 先删除依赖表的数据
      db.prepare('DELETE FROM comments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM paid_promotions WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM publish_links WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM activity_logs WHERE userId = ?').run(userId);
      
      // 再删除主表数据
      db.prepare('DELETE FROM orders WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM todos WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM brands WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM payments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM assets WHERE userId = ?').run(userId);

      // 导入品牌
      if (Array.isArray(brands)) {
        const brandStmt = db.prepare(`
          INSERT INTO brands (id, userId, name, industry, contact, phone, contacts, totalOrders, totalIncome, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        brands.forEach((brand: any) => {
          const brandId = brand.id || uuidv4();
          const contactsJson = brand.contacts
            ? (typeof brand.contacts === 'string' ? brand.contacts : JSON.stringify(brand.contacts))
            : (brand.contact || brand.phone ? JSON.stringify([{ id: uuidv4(), name: brand.contact || '', phone: brand.phone || '', note: '' }]) : null);
          brandStmt.run(
            brandId, userId, brand.name, brand.industry || null, brand.contact || null, brand.phone || null,
            contactsJson, brand.totalOrders || 0, brand.totalIncome || 0, brand.createdAt || new Date().toISOString()
          );
        });
      }

      // 导入商单
      if (Array.isArray(orders)) {
        const orderStmt = db.prepare(`
          INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        orders.forEach((order: any) => {
          const orderId = order.id || uuidv4();
          const orderNo = order.orderNo || generateOrderNo();
          const platforms = normalizeStringArray(order.platforms ?? order.platform);
          const actualAmount = Number(order.actualAmount ?? order.amount ?? order.expectedAmount ?? 0) || 0;
          const expectedAmount = Number(order.expectedAmount ?? order.actualAmount ?? order.amount ?? 0) || 0;
          const acceptDate = order.acceptDate || order.publishDate || null;
          const submitDate = order.submitDate || order.deadline || null;
          orderStmt.run(
            orderId, userId, orderNo, order.title || order.name || '未命名商单', order.type || 'paid', order.status || 'in_progress',
            expectedAmount, actualAmount, order.brandName || order.brand || null,
            JSON.stringify(platforms), acceptDate, submitDate,
            order.productName || null, Number(order.productValue ?? 0) || 0,
            order.createdAt || new Date().toISOString()
          );
        });
      }

      // 导入待办
      if (Array.isArray(todos)) {
        const todoStmt = db.prepare(`
          INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        todos.forEach((todo: any) => {
          const todoId = todo.id || uuidv4();
          todoStmt.run(
            todoId, userId, todo.content, todo.priority || 'medium', todo.category || null,
            todo.completed ? 1 : 0, todo.dueDate || null, todo.orderId || null, todo.brandId || null,
            todo.createdAt || new Date().toISOString()
          );
        });
      }

      // 导入账单
      if (Array.isArray(payments)) {
        const paymentStmt = db.prepare(`
          INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, method, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        payments.forEach((payment: any) => {
          const paymentId = payment.id || uuidv4();
          const amount = Number(payment.amount ?? payment.actualAmount ?? 0) || 0;
          const createdDate = typeof payment.createdAt === 'string' ? payment.createdAt.substring(0, 10) : null;
          paymentStmt.run(
            paymentId, userId, payment.orderNo || null, payment.brand || payment.brandName || null, amount,
            normalizePaymentType(payment.type), payment.date || createdDate, payment.method || payment.remark || null, payment.createdAt || payment.date || new Date().toISOString()
          );
        });
      }

      // 导入资产
      if (Array.isArray(assets)) {
        const assetStmt = db.prepare(`
          INSERT INTO assets (id, userId, orderId, orderNo, brandName, productName, productValue, image, saleStatus, soldAmount, soldDate, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        assets.forEach((asset: any) => {
          const assetId = asset.id || uuidv4();
          const assetOrderId = asset.orderId || `imported-${assetId}`;
          assetStmt.run(
            assetId, userId, assetOrderId, asset.orderNo || null, asset.brandName || asset.brand || null,
            asset.productName || asset.name || '未知产品', Number(asset.productValue ?? asset.value ?? 0) || 0, asset.image || null,
            asset.saleStatus || 'keep', asset.soldAmount || 0, asset.soldDate || null, asset.createdAt || new Date().toISOString()
          );
        });
      }

      // 导入发布链接
      if (Array.isArray(publishLinks)) {
        const linkStmt = db.prepare(`
          INSERT INTO publish_links (id, orderId, userId, platform, url, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        publishLinks.forEach((link: any) => {
          const linkId = link.id || uuidv4();
          linkStmt.run(
            linkId, link.orderId || null, userId, link.platform || '其他', link.url || '',
            link.createdAt || new Date().toISOString()
          );
        });
      }

      // 导入付费推广记录（旧版备份没有 paidPromotions 时自动跳过）
      if (Array.isArray(paidPromotions)) {
        const promotionStmt = db.prepare(`
          INSERT INTO paid_promotions (id, orderId, userId, platform, amount, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        paidPromotions.forEach((promotion: any) => {
          if (!promotion.orderId) return;
          const promotionId = promotion.id || uuidv4();
          promotionStmt.run(
            promotionId,
            promotion.orderId,
            userId,
            promotion.platform || '其他',
            Number(promotion.amount) || 0,
            promotion.createdAt || new Date().toISOString()
          );
        });
      }

      // 导入评论
      if (Array.isArray(comments)) {
        const commentStmt = db.prepare(`
          INSERT INTO comments (id, userId, orderId, content, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `);
        comments.forEach((comment: any) => {
          const commentId = comment.id || uuidv4();
          commentStmt.run(
            commentId, userId, comment.orderId || null, comment.content || '',
            comment.createdAt || new Date().toISOString()
          );
        });
      }

      // 导入设置
      if (importedSettings) {
        const { displayName, email, bio, orderReminder, weeklyReport, avatar, apiKey } = importedSettings;
        db.prepare(`
          UPDATE settings
          SET displayName = ?, email = ?, bio = ?, orderReminder = ?, weeklyReport = ?, avatar = ?, apiKey = ?
          WHERE userId = ?
        `).run(displayName || '博主账号', email || '', bio || '', orderReminder ? 1 : 0, weeklyReport ? 1 : 0, avatar || '', apiKey || '', userId);
      }
    });

    importData();
    res.json({ success: true });
  } catch (error) {
    console.error('导入数据错误:', error);
    res.status(500).json({ error: '导入数据失败，请稍后重试' });
  }
});

// JSON 批量导入商单
router.post('/orders', (req, res) => {
  try {
    const userId = getUserId(req);
    const { data } = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: '导入数据为空' });
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };

    data.forEach((row: any, index: number) => {
      try {
        const mappedRow: any = {};
        Object.keys(row).forEach(key => {
          const mappedKey = EXCEL_FIELD_MAP[key.trim()];
          if (mappedKey) mappedRow[mappedKey] = row[key];
        });

        if (!mappedRow.title) {
          results.failed++;
          results.errors.push(`第${index + 1}行: 缺少标题`);
          return;
        }

        mappedRow.type = mappedRow.type && ORDER_TYPE_MAP[mappedRow.type] ? ORDER_TYPE_MAP[mappedRow.type] : 'paid';
        mappedRow.status = mappedRow.status && ORDER_STATUS_MAP[mappedRow.status] ? ORDER_STATUS_MAP[mappedRow.status] : 'in_progress';

        if (mappedRow.platforms && typeof mappedRow.platforms === 'string') {
          mappedRow.platforms = mappedRow.platforms.split(/[,，]/).map((p: string) => p.trim()).filter(Boolean);
        } else {
          mappedRow.platforms = [];
        }

        const amount = Number(mappedRow.actualAmount);
        mappedRow.actualAmount = isNaN(amount) ? 0 : amount;

        const id = uuidv4();
        const orderNo = generateOrderNo();

        db.prepare(`
          INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, userId, orderNo, mappedRow.title.trim(), mappedRow.type, mappedRow.status, 0, mappedRow.actualAmount, mappedRow.brandName || null, JSON.stringify(mappedRow.platforms), mappedRow.acceptDate || null, mappedRow.submitDate || null, null, 0);

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`第${index + 1}行: ${error instanceof Error ? error.message : '处理失败'}`);
      }
    });

    logActivity(userId, 'import', 'order', 'batch', `批量导入商单: 成功${results.success}条, 失败${results.failed}条`);
    return res.json(results);
  } catch (error) {
    console.error('批量导入商单错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '批量导入商单失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/orders/file', requireAuth, upload.single('file'), async (req, res) => {
  const userId = getUserId(req);
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: '请上传文件' });
  }

  try {
    const data = await parseUploadedOrderFile(file);

    if (data.length === 0) {
      return res.status(400).json({ error: '文件内容为空' });
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };

    data.forEach((row: any, index: number) => {
      try {
        const mappedRow: any = {};
        Object.keys(row).forEach(key => {
          const mappedKey = EXCEL_FIELD_MAP[key.trim()];
          if (mappedKey) mappedRow[mappedKey] = row[key];
        });

        if (!mappedRow.title) {
          results.failed++;
          results.errors.push(`第${index + 2}行: 缺少标题`);
          return;
        }

        mappedRow.type = mappedRow.type && ORDER_TYPE_MAP[mappedRow.type] ? ORDER_TYPE_MAP[mappedRow.type] : 'paid';
        mappedRow.status = mappedRow.status && ORDER_STATUS_MAP[mappedRow.status] ? ORDER_STATUS_MAP[mappedRow.status] : 'in_progress';

        if (mappedRow.platforms && typeof mappedRow.platforms === 'string') {
          mappedRow.platforms = mappedRow.platforms.split(/[,，]/).map((p: string) => p.trim()).filter(Boolean);
        } else {
          mappedRow.platforms = [];
        }

        const amount = Number(mappedRow.actualAmount);
        mappedRow.actualAmount = isNaN(amount) ? 0 : amount;

        const id = uuidv4();
        const orderNo = generateOrderNo();

        db.prepare(`
          INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, userId, orderNo, mappedRow.title.trim(), mappedRow.type, mappedRow.status, 0, mappedRow.actualAmount, mappedRow.brandName || null, JSON.stringify(mappedRow.platforms), mappedRow.acceptDate || null, mappedRow.submitDate || null, null, 0);

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`第${index + 2}行: ${error instanceof Error ? error.message : '处理失败'}`);
      }
    });

    logActivity(userId, 'import_file', 'order', 'batch', `文件导入商单: 成功${results.success}条, 失败${results.failed}条`);
    return res.json(results);
  } catch (error) {
    console.error('文件导入商单错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: '文件解析失败，请检查文件格式' });
  } finally {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
});

export default router;
