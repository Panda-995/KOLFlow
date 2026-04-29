import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import * as XLSX from 'xlsx';
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
    // 只允许 Excel 文件
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv'
    ];
    const allowedExt = ['.xls', '.xlsx', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) || allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传 Excel 文件 (.xls, .xlsx, .csv)'));
    }
  }
});
const router = Router();

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
    const comments = db.prepare('SELECT * FROM comments WHERE userId = ? ORDER BY createdAt DESC').all(userId);

    res.json({
      orders: orders.map((o: any) => ({ ...o, platforms: safeJsonParse(o.platforms, []) })),
      brands,
      payments,
      todos: todos.map((t: any) => ({ ...t, completed: Boolean(t.completed) })),
      settings,
      publishLinks,
      comments
    });
  } catch (error) {
    console.error('导出数据错误:', error);
    res.status(500).json({ error: '导出数据失败，请稍后重试' });
  }
});

// 清空数据
router.post('/clear', (req, res) => {
  try {
    const userId = getUserId(req);
    // 禁用外键约束以便安全删除数据
    db.pragma('foreign_keys = OFF');
    // 先删除依赖表的数据
    db.prepare('DELETE FROM comments WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM publish_links WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM activity_logs WHERE userId = ?').run(userId);
    // 再删除主表数据
    db.prepare('DELETE FROM orders WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM todos WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM brands WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM payments WHERE userId = ?').run(userId);
    // 重新启用外键约束
    db.pragma('foreign_keys = ON');
    res.json({ success: true });
  } catch (error) {
    console.error('清空数据错误:', error);
    res.status(500).json({ error: '清空数据失败，请稍后重试' });
  }
});

// 导入数据
router.post('/import', (req, res) => {
  try {
    const userId = getUserId(req);
    const { orders, brands, payments, todos, settings: importedSettings, publishLinks, comments } = req.body;

    // 使用事务确保数据一致性
    const importData = db.transaction(() => {
      // 先删除依赖表的数据
      db.prepare('DELETE FROM comments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM publish_links WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM activity_logs WHERE userId = ?').run(userId);
      
      // 再删除主表数据
      db.prepare('DELETE FROM orders WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM todos WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM brands WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM payments WHERE userId = ?').run(userId);

      // 导入品牌
      if (Array.isArray(brands)) {
        const brandStmt = db.prepare(`
          INSERT INTO brands (id, userId, name, industry, contact, phone, totalOrders, totalIncome, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        brands.forEach((brand: any) => {
          const brandId = brand.id || uuidv4();
          brandStmt.run(
            brandId, userId, brand.name, brand.industry || null, brand.contact || null, brand.phone || null,
            brand.totalOrders || 0, brand.totalIncome || 0, brand.createdAt || new Date().toISOString()
          );
        });
      }

      // 导入商单
      if (Array.isArray(orders)) {
        const orderStmt = db.prepare(`
          INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        orders.forEach((order: any) => {
          const orderId = order.id || uuidv4();
          const orderNo = order.orderNo || generateOrderNo();
          orderStmt.run(
            orderId, userId, orderNo, order.title, order.type || 'paid', order.status || 'in_progress',
            order.expectedAmount || 0, order.actualAmount || 0, order.brandName || null,
            JSON.stringify(order.platforms || []), order.acceptDate || null, order.submitDate || null,
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
          paymentStmt.run(
            paymentId, userId, payment.orderNo || null, payment.brand || null, payment.amount || 0,
            payment.type || 'pending', payment.date || null, payment.method || null, payment.createdAt || new Date().toISOString()
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
          INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, userId, orderNo, mappedRow.title.trim(), mappedRow.type, mappedRow.status, 0, mappedRow.actualAmount, mappedRow.brandName || null, JSON.stringify(mappedRow.platforms), mappedRow.acceptDate || null, mappedRow.submitDate || null);

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`第${index + 1}行: ${error instanceof Error ? error.message : '处理失败'}`);
      }
    });

    logActivity(userId, 'import', 'order', 'batch', `批量导入商单: 成功${results.success}条, 失败${results.failed}条`);
    res.json(results);
  } catch (error) {
    console.error('批量导入商单错误:', error instanceof Error ? error.message : error);
    res.status(500).json({ 
      error: '批量导入商单失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

router.post('/orders/file', upload.single('file'), (req, res) => {
  const userId = getUserId(req);
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: '请上传文件' });
  }

  try {
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    fs.unlinkSync(file.path);

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
          INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, userId, orderNo, mappedRow.title.trim(), mappedRow.type, mappedRow.status, 0, mappedRow.actualAmount, mappedRow.brandName || null, JSON.stringify(mappedRow.platforms), mappedRow.acceptDate || null, mappedRow.submitDate || null);

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push(`第${index + 2}行: ${error instanceof Error ? error.message : '处理失败'}`);
      }
    });

    logActivity(userId, 'import_file', 'order', 'batch', `文件导入商单: 成功${results.success}条, 失败${results.failed}条`);
    res.json(results);
  } catch (error) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.status(500).json({ error: '文件解析失败，请检查文件格式' });
  }
});

export default router;