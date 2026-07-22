import { Router } from 'express';
import db, { generateUniqueApiKey } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { readSheet } from 'read-excel-file/node';
import { parse as parseCsv } from 'csv-parse/sync';
import { logActivity, getUserId } from './utils/index.js';
import { EXCEL_FIELD_MAP, ORDER_TYPE_MAP, ORDER_STATUS_MAP } from './utils/constants.js';
import { formatLocalDate, generateOrderNo, safeJsonParse } from './utils/helpers.js';
import { syncOrderDerivedRecords } from '../services/orderService.js';
import { ApiError, getApiErrorMessage, getApiErrorStatus } from '../services/errors.js';

const router = Router();

type ImportRow = Record<string, unknown>;

const BACKUP_VERSION = 2;
const MAX_IMPORT_ITEMS = 10_000;
const IMPORT_COLLECTIONS = [
  'orders',
  'brands',
  'payments',
  'todos',
  'assets',
  'publishLinks',
  'paidPromotions',
  'comments',
] as const;

type ImportCollection = typeof IMPORT_COLLECTIONS[number];
type ImportPreview = {
  backupVersion: number | null;
  legacy: boolean;
  counts: Record<ImportCollection, number>;
  conflicts: { ids: number; orderNos: number; apiKey: number };
  warnings: string[];
};

const COLLECTION_TABLES: Record<ImportCollection, string> = {
  orders: 'orders',
  brands: 'brands',
  payments: 'payments',
  todos: 'todos',
  assets: 'assets',
  publishLinks: 'publish_links',
  paidPromotions: 'paid_promotions',
  comments: 'comments',
};

const readImportCollection = (payload: Record<string, unknown>, name: ImportCollection): any[] => {
  const value = payload[name];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(`${name} 必须是数组`);
  if (value.length > MAX_IMPORT_ITEMS) throw new ApiError(`${name} 超过单次导入上限 ${MAX_IMPORT_ITEMS}`);
  return value;
};

const assertUniqueValues = (items: any[], field: string, label: string) => {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object' || item[field] === undefined || item[field] === null || item[field] === '') continue;
    const value = String(item[field]);
    if (seen.has(value)) throw new ApiError(`${label}存在重复值: ${value}`);
    seen.add(value);
  }
};

const analyzeImportPayload = (userId: string, rawPayload: unknown): ImportPreview => {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    throw new ApiError('备份文件结构无效');
  }
  const payload = rawPayload as Record<string, unknown>;
  const rawVersion = payload.backupVersion;
  const backupVersion = rawVersion === undefined ? null : Number(rawVersion);
  if (backupVersion !== null && (!Number.isInteger(backupVersion) || backupVersion < 1 || backupVersion > BACKUP_VERSION)) {
    throw new ApiError(`不支持的备份版本: ${String(rawVersion)}`);
  }

  const collections = Object.fromEntries(
    IMPORT_COLLECTIONS.map(name => [name, readImportCollection(payload, name)]),
  ) as Record<ImportCollection, any[]>;
  if (collections.orders.some(order => !order || typeof order !== 'object' || !String(order.title || order.name || '').trim())) {
    throw new ApiError('商单数据存在空标题');
  }
  if (collections.brands.some(brand => !brand || typeof brand !== 'object' || !String(brand.name || '').trim())) {
    throw new ApiError('品牌数据存在空名称');
  }
  for (const name of IMPORT_COLLECTIONS) assertUniqueValues(collections[name], 'id', `${name} ID`);
  assertUniqueValues(collections.orders, 'orderNo', '商单号');

  let idConflicts = 0;
  for (const name of IMPORT_COLLECTIONS) {
    const table = COLLECTION_TABLES[name];
    const findConflict = db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND userId <> ?`);
    for (const item of collections[name]) {
      if (item?.id && findConflict.get(String(item.id), userId)) idConflicts++;
    }
  }
  const orderNoConflicts = collections.orders.reduce((count, order) => (
    order?.orderNo && db.prepare('SELECT 1 FROM orders WHERE orderNo = ? AND userId <> ?').get(String(order.orderNo), userId)
      ? count + 1
      : count
  ), 0);
  const importedApiKey = (payload.settings as any)?.apiKey;
  const apiKeyConflicts = typeof importedApiKey === 'string' && importedApiKey.trim()
    && db.prepare('SELECT 1 FROM settings WHERE apiKey = ? AND userId <> ?').get(importedApiKey.trim(), userId)
    ? 1
    : 0;

  const warnings: string[] = [];
  if (backupVersion === null) warnings.push('旧版备份没有版本号，将按兼容模式导入');
  if (idConflicts) warnings.push(`${idConflicts} 个记录 ID 与其他账号冲突，导入时将自动生成新 ID`);
  if (orderNoConflicts) warnings.push(`${orderNoConflicts} 个商单号与其他账号冲突，导入时将自动生成新商单号`);
  if (apiKeyConflicts) warnings.push('API Key 与其他账号冲突，导入时将生成新 Key');

  return {
    backupVersion,
    legacy: backupVersion === null,
    counts: Object.fromEntries(IMPORT_COLLECTIONS.map(name => [name, collections[name].length])) as Record<ImportCollection, number>,
    conflicts: { ids: idConflicts, orderNos: orderNoConflicts, apiKey: apiKeyConflicts },
    warnings,
  };
};

const allocateImportedId = (table: string, userId: string, value: unknown): string => {
  const requestedId = typeof value === 'string' && value ? value : uuidv4();
  const conflict = db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND userId <> ?`).get(requestedId, userId);
  return conflict ? uuidv4() : requestedId;
};

const allocateImportedOrderNo = (userId: string, value: unknown): string => {
  const requestedOrderNo = typeof value === 'string' && value.trim() ? value.trim() : generateOrderNo();
  return db.prepare('SELECT 1 FROM orders WHERE orderNo = ? AND userId <> ?').get(requestedOrderNo, userId)
    ? generateOrderNo()
    : requestedOrderNo;
};

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedExt = ['.xlsx', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传 .xlsx 或 .csv 文件'));
    }
  },
});

const normalizeCellValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return formatLocalDate(value);
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

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }

  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

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

const resolveImportedApiKey = (userId: string, value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const apiKey = value.trim();
  const conflict = db.prepare('SELECT userId FROM settings WHERE apiKey = ? AND userId <> ?').get(apiKey, userId);
  if (!conflict) return apiKey;

  return generateUniqueApiKey();
};

const mapImportedOrderRow = (row: Record<string, any>): Record<string, any> => {
  const mappedRow: Record<string, any> = { ...row };
  Object.keys(row).forEach(key => {
    const mappedKey = EXCEL_FIELD_MAP[key.trim()];
    if (mappedKey) mappedRow[mappedKey] = row[key];
  });
  return mappedRow;
};

const normalizeOrderType = (value: unknown): string => {
  if (typeof value !== 'string') return 'paid';
  return ORDER_TYPE_MAP[value] || value || 'paid';
};

const normalizeOrderStatus = (value: unknown): string => {
  if (typeof value !== 'string') return 'in_progress';
  return ORDER_STATUS_MAP[value] || value || 'in_progress';
};

const resolveOrderIdFactory = (orderIdMap: Map<string, string>, importedOrderIds: Set<string>) => {
  return (orderId: unknown): string | null => {
    if (!orderId) return null;
    const sourceId = String(orderId);
    const resolved = orderIdMap.get(sourceId) || sourceId;
    return importedOrderIds.has(resolved) ? resolved : null;
  };
};

const insertImportedOrder = (
  userId: string,
  mappedRow: Record<string, any>,
  options: { syncDerived?: boolean } = {},
): string => {
  const title = String(mappedRow.title || mappedRow.name || '').trim();
  if (!title) {
    throw new Error('缺少标题');
  }

  const id = allocateImportedId('orders', userId, mappedRow.id);
  const orderNo = allocateImportedOrderNo(userId, mappedRow.orderNo);
  const brandName = mappedRow.brandName || mappedRow.brand || null;
  const platforms = normalizeStringArray(mappedRow.platforms ?? mappedRow.platform);
  const expectedAmount = Number(mappedRow.expectedAmount ?? mappedRow.actualAmount ?? mappedRow.amount ?? 0) || 0;
  const actualAmount = Number(mappedRow.actualAmount ?? mappedRow.amount ?? mappedRow.expectedAmount ?? 0) || 0;
  const productValue = Number(mappedRow.productValue ?? mappedRow.value ?? 0) || 0;
  const acceptDate = mappedRow.acceptDate || mappedRow.publishDate || null;
  const submitDate = mappedRow.submitDate || mappedRow.deadline || null;
  const type = normalizeOrderType(mappedRow.type);
  const status = normalizeOrderStatus(mappedRow.status);
  const productName = mappedRow.productName || null;
  const createdAt = mappedRow.createdAt || new Date().toISOString();

  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    orderNo,
    title,
    type,
    status,
    expectedAmount,
    actualAmount,
    brandName,
    JSON.stringify(platforms),
    acceptDate,
    submitDate,
    productName,
    productValue,
    createdAt,
  );

  const brand = brandName
    ? db.prepare('SELECT id FROM brands WHERE name = ? AND userId = ?').get(brandName, userId) as any
    : null;
  db.prepare(`
    INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    userId,
    `商单任务: ${title}`,
    'high',
    brandName,
    status === 'completed' ? 1 : 0,
    submitDate,
    id,
    brand?.id || null,
  );

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(id, userId) as any;
  if (options.syncDerived !== false) {
    syncOrderDerivedRecords(order, userId);
  }
  return id;
};

const importOrderRows = (userId: string, rows: Record<string, any>[], firstLineNumber: number) => {
  const results = { success: 0, failed: 0, errors: [] as string[] };

  rows.forEach((row, index) => {
    try {
      insertImportedOrder(userId, mapImportedOrderRow(row));
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push(`第${index + firstLineNumber}行: ${error instanceof Error ? error.message : '处理失败'}`);
    }
  });

  return results;
};

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
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      orders: orders.map((o: any) => ({ ...o, platforms: safeJsonParse(o.platforms, []) })),
      brands,
      payments,
      todos: todos.map((t: any) => ({ ...t, completed: Boolean(t.completed) })),
      settings,
      publishLinks,
      paidPromotions,
      comments,
      assets,
    });
  } catch (error) {
    console.error('导出数据错误:', error);
    return res.status(500).json({ error: '导出数据失败，请稍后重试' });
  }
});

router.post('/clear', (req, res) => {
  try {
    const userId = getUserId(req);

    const clearUserData = db.transaction(() => {
      db.prepare('DELETE FROM comments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM paid_promotions WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM publish_links WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM activity_logs WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM todos WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM payments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM assets WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM orders WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM brands WHERE userId = ?').run(userId);
    });

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

router.post('/import/preview', (req, res) => {
  try {
    return res.json(analyzeImportPayload(getUserId(req), req.body));
  } catch (error) {
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '导入预检失败') });
  }
});

router.post('/import', (req, res) => {
  try {
    const userId = getUserId(req);
    const preview = analyzeImportPayload(userId, req.body);
    const { orders, brands, payments, todos, settings: importedSettings, publishLinks, paidPromotions, comments, assets, operationDate } = req.body;

    const importData = db.transaction(() => {
      const brandIdMap = new Map<string, string>();
      const orderIdMap = new Map<string, string>();
      const orderNoMap = new Map<string, string>();
      const importedOrderIds = new Set<string>();
      const resolveImportedOrderId = resolveOrderIdFactory(orderIdMap, importedOrderIds);
      const resolveImportedOrderNo = (value: unknown): string | null => {
        if (typeof value !== 'string' || !value.trim()) return null;
        const sourceOrderNo = value.trim();
        const existing = orderNoMap.get(sourceOrderNo);
        if (existing) return existing;
        const resolved = allocateImportedOrderNo(userId, sourceOrderNo);
        orderNoMap.set(sourceOrderNo, resolved);
        return resolved;
      };

      if (Array.isArray(brands)) {
        brands.forEach((brand: any) => {
          if (brand?.id) brandIdMap.set(String(brand.id), allocateImportedId('brands', userId, brand.id));
        });
      }
      if (Array.isArray(orders)) {
        orders.forEach((order: any) => {
          if (order?.id) orderIdMap.set(String(order.id), allocateImportedId('orders', userId, order.id));
          if (order?.orderNo) orderNoMap.set(String(order.orderNo), allocateImportedOrderNo(userId, order.orderNo));
        });
      }

      db.prepare('DELETE FROM comments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM paid_promotions WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM publish_links WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM activity_logs WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM todos WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM payments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM assets WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM orders WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM brands WHERE userId = ?').run(userId);

      if (Array.isArray(brands)) {
        const brandStmt = db.prepare(`
          INSERT INTO brands (id, userId, name, industry, contact, phone, contacts, totalOrders, totalIncome, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        brands.forEach((brand: any) => {
          const brandId = brand.id ? (brandIdMap.get(String(brand.id)) || uuidv4()) : uuidv4();
          const contactsJson = brand.contacts
            ? (typeof brand.contacts === 'string' ? brand.contacts : JSON.stringify(brand.contacts))
            : (brand.contact || brand.phone ? JSON.stringify([{ id: uuidv4(), name: brand.contact || '', phone: brand.phone || '', note: '' }]) : null);
          brandStmt.run(
            brandId,
            userId,
            brand.name,
            brand.industry || null,
            brand.contact || null,
            brand.phone || null,
            contactsJson,
            brand.totalOrders || 0,
            brand.totalIncome || 0,
            brand.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(orders)) {
        orders.forEach((order: any) => {
          const sourceOrderId = order.id ? String(order.id) : null;
          const sourceOrderNo = order.orderNo ? String(order.orderNo) : null;
          const orderId = insertImportedOrder(userId, {
            ...order,
            id: sourceOrderId ? orderIdMap.get(sourceOrderId) : uuidv4(),
            orderNo: sourceOrderNo ? orderNoMap.get(sourceOrderNo) : generateOrderNo(),
          }, { syncDerived: false });
          if (sourceOrderId) {
            orderIdMap.set(sourceOrderId, orderId);
          }
          importedOrderIds.add(orderId);
        });
      }

      if (Array.isArray(todos)) {
        const todoStmt = db.prepare(`
          INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        todos.forEach((todo: any) => {
          const resolvedOrderId = resolveImportedOrderId(todo.orderId);
          const todoContent = todo.content || '待办事项';
          const isGeneratedOrderTodo = resolvedOrderId && String(todoContent).trim().startsWith('商单任务:');
          if (isGeneratedOrderTodo) {
            return;
          }
          todoStmt.run(
            allocateImportedId('todos', userId, todo.id),
            userId,
            todoContent,
            todo.priority || 'medium',
            todo.category || null,
            todo.completed ? 1 : 0,
            todo.dueDate || null,
            resolvedOrderId,
            todo.brandId ? (brandIdMap.get(String(todo.brandId)) || null) : null,
            todo.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(payments)) {
        const paymentStmt = db.prepare(`
          INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, dueDate, settledDate, method, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        payments.forEach((payment: any) => {
          const paymentId = allocateImportedId('payments', userId, payment.id);
          const amount = Number(payment.amount ?? payment.actualAmount ?? 0) || 0;
          const createdDate = typeof payment.createdAt === 'string' ? payment.createdAt.substring(0, 10) : null;
          const type = normalizePaymentType(payment.type);
          const legacyDate = payment.date || createdDate;
          const dueDate = payment.dueDate || (type === 'pending' ? legacyDate : null);
          const settledDate = payment.settledDate || (type === 'settled' ? legacyDate : null);
          const compatibilityDate = type === 'settled' ? settledDate : dueDate;
          paymentStmt.run(
            paymentId,
            userId,
            resolveImportedOrderNo(payment.orderNo),
            payment.brand || payment.brandName || null,
            amount,
            type,
            compatibilityDate,
            dueDate,
            settledDate,
            payment.method || payment.remark || null,
            payment.createdAt || compatibilityDate || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(assets)) {
        const assetStmt = db.prepare(`
          INSERT INTO assets (id, userId, orderId, orderNo, brandName, productName, productValue, image, saleStatus, soldAmount, soldDate, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        assets.forEach((asset: any) => {
          const assetId = allocateImportedId('assets', userId, asset.id);
          const assetOrderId = resolveImportedOrderId(asset.orderId) || `imported-${assetId}`;
          assetStmt.run(
            assetId,
            userId,
            assetOrderId,
            resolveImportedOrderNo(asset.orderNo),
            asset.brandName || asset.brand || null,
            asset.productName || asset.name || '未知产品',
            Number(asset.productValue ?? asset.value ?? 0) || 0,
            asset.image || null,
            asset.saleStatus || 'keep',
            Number(asset.soldAmount ?? 0) || 0,
            asset.soldDate || null,
            asset.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(publishLinks)) {
        const linkStmt = db.prepare(`
          INSERT INTO publish_links (id, orderId, userId, platform, url, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        publishLinks.forEach((link: any) => {
          const resolvedOrderId = resolveImportedOrderId(link.orderId);
          if (!resolvedOrderId) return;
          linkStmt.run(
            allocateImportedId('publish_links', userId, link.id),
            resolvedOrderId,
            userId,
            link.platform || '其他',
            link.url || '',
            link.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(paidPromotions)) {
        const promotionStmt = db.prepare(`
          INSERT INTO paid_promotions (id, orderId, userId, platform, amount, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        paidPromotions.forEach((promotion: any) => {
          const resolvedOrderId = resolveImportedOrderId(promotion.orderId);
          if (!resolvedOrderId) return;
          promotionStmt.run(
            allocateImportedId('paid_promotions', userId, promotion.id),
            resolvedOrderId,
            userId,
            promotion.platform || '其他',
            Number(promotion.amount) || 0,
            promotion.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(comments)) {
        const commentStmt = db.prepare(`
          INSERT INTO comments (id, userId, orderId, content, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `);
        comments.forEach((comment: any) => {
          const resolvedOrderId = resolveImportedOrderId(comment.orderId);
          if (!resolvedOrderId) return;
          commentStmt.run(
            allocateImportedId('comments', userId, comment.id),
            userId,
            resolvedOrderId,
            comment.content || '',
            comment.createdAt || new Date().toISOString(),
          );
        });
      }

      if (importedSettings) {
        const { displayName, bio, orderReminder, weeklyReport, avatar, apiKey, reportFrequency } = importedSettings;
        const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email?: string } | undefined;
        const resolvedApiKey = resolveImportedApiKey(userId, apiKey);
        db.prepare(`
          UPDATE settings
          SET displayName = ?, email = ?, bio = ?, orderReminder = ?, weeklyReport = ?, avatar = ?, apiKey = ?, reportFrequency = ?
          WHERE userId = ?
        `).run(
          displayName || '博主账号',
          user?.email || '',
          bio || '',
          orderReminder ? 1 : 0,
          weeklyReport ? 1 : 0,
          avatar || '',
          resolvedApiKey,
          reportFrequency === 'monthly' ? 'monthly' : 'weekly',
          userId,
        );
      }

      const importedOrders = db.prepare('SELECT * FROM orders WHERE userId = ?').all(userId) as any[];
      importedOrders.forEach(order => syncOrderDerivedRecords(order, userId, operationDate));
    });

    importData();
    return res.json({ success: true, preview });
  } catch (error) {
    console.error('导入数据错误:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '导入数据失败，请稍后重试') });
  }
});

router.post('/orders', (req, res) => {
  try {
    const userId = getUserId(req);
    const { data } = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: '导入数据为空' });
    }

    const results = importOrderRows(userId, data, 1);
    logActivity(userId, 'import', 'order', 'batch', `批量导入商单: 成功${results.success}条，失败${results.failed}条`);
    return res.json(results);
  } catch (error) {
    console.error('批量导入商单错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: '批量导入商单失败，请稍后重试',
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/orders/file', upload.single('file'), async (req, res) => {
  let file: Express.Multer.File | undefined;
  try {
    const userId = getUserId(req);
    file = req.file;

    if (!file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    const data = await parseUploadedOrderFile(file);
    if (data.length === 0) {
      return res.status(400).json({ error: '文件内容为空' });
    }

    const results = importOrderRows(userId, data as Record<string, any>[], 2);
    logActivity(userId, 'import_file', 'order', 'batch', `文件导入商单: 成功${results.success}条，失败${results.failed}条`);
    return res.json(results);
  } catch (error) {
    console.error('文件导入商单错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: '文件解析失败，请检查文件格式' });
  } finally {
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
});

export default router;
