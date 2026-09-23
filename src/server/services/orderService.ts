import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logActivity } from '../routes/utils/index.js';
import { formatLocalDate, generateOrderNo, isValidDateOnly, safeJsonParse, validateAmount } from '../routes/utils/helpers.js';
import type { CountRow } from '../dbRows.js';

export type OrderRow = {
  id: string;
  userId: string;
  orderNo: string;
  title: string;
  type: string;
  status: string;
  expectedAmount?: number | null;
  actualAmount: number | null;
  brandName: string | null;
  platforms: string | string[] | null;
  acceptDate?: string | null;
  submitDate?: string | null;
  productName?: string | null;
  productValue: number | null;
  createdAt?: string;
};

type OrderInput = {
  title: string;
  type?: string;
  status?: string;
  expectedAmount?: number;
  actualAmount?: number;
  brandName?: string | null;
  platforms?: string[];
  acceptDate?: string | null;
  submitDate?: string | null;
  productName?: string | null;
  productValue?: number;
  operationDate?: string;
};

type OrderUpdate = Partial<OrderInput>;

const isExchangeType = (type: string | null | undefined): boolean => {
  return type === 'product_exchange' || type === 'ecard';
};

const isMonetaryType = (type: string | null | undefined): boolean => {
  return !isExchangeType(type || '');
};

const VALID_ORDER_TYPES = ['paid', 'product_exchange', 'direct', 'ecard'];
const VALID_ORDER_STATUSES = ['in_progress', 'completed', 'cancelled'];

const assertValidOrderType = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !VALID_ORDER_TYPES.includes(value)) {
    throw new Error('商单类型无效，必须为付费/置换/直发/E卡之一');
  }
  return value;
};

const assertValidOrderStatus = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !VALID_ORDER_STATUSES.includes(value)) {
    throw new Error('商单状态无效，必须为进行中/已完成/已取消之一');
  }
  return value;
};

const normalizePlatformsInput = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error('平台数据必须是数组');
  }
  const platforms = value.map(item => String(item).trim()).filter(Boolean);
  if (platforms.length > 10) {
    throw new Error('平台数量不能超过10个');
  }
  if (platforms.some(platform => platform.length > 30)) {
    throw new Error('单个平台名称不能超过30个字符');
  }
  return platforms;
};

const normalizeDateInput = (value: unknown, label: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !isValidDateOnly(value)) {
    throw new Error(`${label}格式无效，应为 YYYY-MM-DD`);
  }
  return value;
};

const toNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

// 接口入参的金额解析：非法输入（如 "abc"）直接报错，不静默转成 0。
// 空值视为 0，由 validateAmount 做范围校验。
const parseAmountInput = (value: unknown): number => {
  if (value === undefined || value === null || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error('金额数值无效');
  return num;
};

const parsePlatformsField = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(item => String(item));
  const parsed = safeJsonParse(typeof value === 'string' ? value : null, []);
  return Array.isArray(parsed) ? parsed.map(item => String(item)) : [];
};

const normalizeOrder = (order: OrderRow): OrderRow => ({
  ...order,
  actualAmount: toNumber(order.actualAmount),
  productValue: toNumber(order.productValue),
});

const parseOrderForClient = (order: OrderRow | undefined) => {
  if (!order) return undefined;
  return {
    ...order,
    platforms: parsePlatformsField(order.platforms),
  };
};

const getBrandId = (userId: string, brandName: string | null): string | null => {
  if (!brandName) return null;
  const brand = db.prepare('SELECT id FROM brands WHERE name = ? AND userId = ?').get(brandName, userId) as { id: string } | undefined;
  return brand?.id || null;
};

const getAssetProductName = (order: OrderRow): string => {
  if (order.type === 'ecard') {
    return `${order.brandName || '未知品牌'} E卡`;
  }
  return order.productName?.trim() || '未知产品';
};

const syncOrderTodo = (order: OrderRow, userId: string): void => {
  const brandId = getBrandId(userId, order.brandName);
  const existingGeneratedTodo = db.prepare(`
    SELECT id FROM todos
    WHERE orderId = ? AND userId = ? AND content LIKE '商单任务:%'
    ORDER BY createdAt ASC
    LIMIT 1
  `).get(order.id, userId) as { id: string } | undefined;

  if (existingGeneratedTodo) {
    db.prepare(`
    UPDATE todos
    SET content = ?, completed = ?, dueDate = ?, category = ?, brandId = ?
    WHERE id = ? AND userId = ?
  `).run(
      `商单任务: ${order.title}`,
      order.status === 'completed' ? 1 : 0,
      order.submitDate || null,
      order.brandName || null,
      brandId,
      existingGeneratedTodo.id,
      userId,
    );
    return;
  }

  db.prepare(`
    INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    userId,
    `商单任务: ${order.title}`,
    'high',
    order.brandName || null,
    order.status === 'completed' ? 1 : 0,
    order.submitDate || null,
    order.id,
    brandId,
  );
};

const resolveOperationDate = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return formatLocalDate();
  if (!isValidDateOnly(value)) throw new Error('操作日期无效');
  return value;
};

const upsertPaymentFromOrder = (order: OrderRow, userId: string, operationDate?: string): string | null => {
  if (order.status !== 'completed' || !isMonetaryType(order.type) || toNumber(order.actualAmount) <= 0) {
    // 仅移除未结算的自动账单；已结算账单代表实际收款，商单状态回退不能删除
    db.prepare("DELETE FROM payments WHERE orderNo = ? AND userId = ? AND (type IS NULL OR type <> 'settled')")
      .run(order.orderNo, userId);
    return null;
  }

  const existing = db.prepare('SELECT * FROM payments WHERE orderNo = ? AND userId = ?').get(order.orderNo, userId) as { id: string; type?: string | null } | undefined;
  if (existing) {
    if (existing.type === 'settled') {
      // 已结算金额是实际收款历史，不随商单金额改写
      db.prepare('UPDATE payments SET brand = ? WHERE id = ? AND userId = ?')
        .run(order.brandName || null, existing.id, userId);
      return existing.id;
    }
    db.prepare(`
      UPDATE payments
      SET brand = ?, amount = ?
      WHERE id = ? AND userId = ?
    `).run(order.brandName || null, order.actualAmount, existing.id, userId);
    return existing.id;
  }

  const paymentId = uuidv4();
  const dueDate = resolveOperationDate(operationDate);
  db.prepare(`
    INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, dueDate, settledDate, method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `).run(
    paymentId,
    userId,
    order.orderNo,
    order.brandName || null,
    order.actualAmount,
    'pending',
    dueDate,
    dueDate,
    '待结算',
  );
  logActivity(userId, 'auto_create', 'payment', paymentId, `商单完成自动创建账单: ${order.brandName || '未知品牌'} ¥${order.actualAmount}`);
  return paymentId;
};

const upsertAssetFromOrder = (order: OrderRow, userId: string): string | null => {
  if (order.status !== 'completed' || !isExchangeType(order.type)) {
    // 仅移除未出售的自动资产；已出售记录是交易历史，商单状态回退不能删除
    db.prepare("DELETE FROM assets WHERE orderId = ? AND userId = ? AND (saleStatus IS NULL OR saleStatus <> 'sold')")
      .run(order.id, userId);
    return null;
  }

  const productName = getAssetProductName(order);
  const productValue = toNumber(order.productValue);
  const existing = db.prepare('SELECT * FROM assets WHERE orderId = ? AND userId = ?').get(order.id, userId) as { id: string } | undefined;
  if (existing) {
    db.prepare(`
      UPDATE assets
      SET orderNo = ?, brandName = ?, productName = ?, productValue = ?
      WHERE id = ? AND userId = ?
    `).run(order.orderNo, order.brandName || null, productName, productValue, existing.id, userId);
    return existing.id;
  }

  const assetId = uuidv4();
  db.prepare(`
    INSERT INTO assets (id, userId, orderId, orderNo, brandName, productName, productValue, saleStatus, soldAmount, soldDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'keep', 0, NULL)
  `).run(assetId, userId, order.id, order.orderNo, order.brandName || null, productName, productValue);
  logActivity(userId, 'auto_create', 'asset', assetId, `${order.type === 'ecard' ? 'E卡' : '置换'}商单完成自动创建资产: ${productName}`);
  return assetId;
};

export const syncOrderDerivedRecords = (order: OrderRow, userId: string, operationDate?: string): void => {
  const normalizedOrder = normalizeOrder(order);
  syncOrderTodo(normalizedOrder, userId);
  upsertPaymentFromOrder(normalizedOrder, userId, operationDate);
  upsertAssetFromOrder(normalizedOrder, userId);
};

export const createOrderWithTodo = (userId: string, orderData: OrderInput) => {
  const { title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue, operationDate } = orderData;

  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error('商单标题不能为空');
  }
  if (title.length > 100) {
    throw new Error('商单标题不能超过100个字符');
  }
  if (!validateAmount(actualAmount) || !validateAmount(expectedAmount) || !validateAmount(productValue)) {
    throw new Error('金额数值无效');
  }
  if (brandName !== undefined && brandName !== null && typeof brandName !== 'string') {
    throw new Error('品牌名称格式无效');
  }
  if (brandName && brandName.length > 50) {
    throw new Error('品牌名称不能超过50个字符');
  }
  if (productName !== undefined && productName !== null && typeof productName !== 'string') {
    throw new Error('产品名称格式无效');
  }
  const normalizedPlatforms = normalizePlatformsInput(platforms);
  const normalizedAcceptDate = normalizeDateInput(acceptDate, '接单日期');
  const normalizedSubmitDate = normalizeDateInput(submitDate, '提交日期');

  const id = uuidv4();
  const orderNo = generateOrderNo();
  const normalizedStatus = assertValidOrderStatus(status) || 'in_progress';
  const normalizedType = assertValidOrderType(type) || 'paid';

  const createOrder = db.transaction(() => {
    db.prepare(`
      INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      orderNo,
      title.trim(),
      normalizedType,
      normalizedStatus,
      parseAmountInput(expectedAmount),
      parseAmountInput(actualAmount),
      brandName?.trim() || null,
      JSON.stringify(normalizedPlatforms),
      normalizedAcceptDate,
      normalizedSubmitDate,
      productName?.trim() || null,
      parseAmountInput(productValue),
    );

    const todoId = uuidv4();
    const brandId = getBrandId(userId, brandName?.trim() || null);
    db.prepare(`
      INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      todoId,
      userId,
      `商单任务: ${title.trim()}`,
      'high',
      brandName?.trim() || null,
      normalizedStatus === 'completed' ? 1 : 0,
      normalizedSubmitDate,
      id,
      brandId,
    );

    const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(id, userId) as OrderRow;
    syncOrderDerivedRecords(createdOrder, userId, operationDate);
    logActivity(userId, 'create', 'order', id, `创建商单: ${title.trim()} (${orderNo})`);
    return createdOrder;
  });

  return parseOrderForClient(createOrder());
};

export const updateOrderWithSync = (userId: string, orderId: string, updateData: OrderUpdate) => {
  const existingOrder = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as OrderRow | undefined;
  if (!existingOrder) {
    throw new Error('商单不存在');
  }

  const existing = normalizeOrder(existingOrder);
  if (updateData.title !== undefined && typeof updateData.title !== 'string') {
    throw new Error('商单标题格式无效');
  }
  const newTitle = updateData.title !== undefined ? updateData.title.trim() : existing.title;
  if (!newTitle) {
    throw new Error('商单标题不能为空');
  }
  if (newTitle.length > 100) {
    throw new Error('商单标题不能超过100个字符');
  }
  if (updateData.brandName !== undefined && updateData.brandName !== null && typeof updateData.brandName !== 'string') {
    throw new Error('品牌名称格式无效');
  }
  if (updateData.productName !== undefined && updateData.productName !== null && typeof updateData.productName !== 'string') {
    throw new Error('产品名称格式无效');
  }

  const nextStatus = assertValidOrderStatus(updateData.status);
  const nextType = assertValidOrderType(updateData.type);
  const nextPlatforms = updateData.platforms !== undefined ? normalizePlatformsInput(updateData.platforms) : null;
  const nextAcceptDate = updateData.acceptDate !== undefined ? normalizeDateInput(updateData.acceptDate, '接单日期') : undefined;
  const nextSubmitDate = updateData.submitDate !== undefined ? normalizeDateInput(updateData.submitDate, '提交日期') : undefined;

  const newOrder: OrderRow = {
    ...existing,
    status: nextStatus || existing.status,
    title: newTitle,
    type: nextType || existing.type,
    expectedAmount: updateData.expectedAmount !== undefined ? parseAmountInput(updateData.expectedAmount) : toNumber(existing.expectedAmount),
    actualAmount: updateData.actualAmount !== undefined ? parseAmountInput(updateData.actualAmount) : toNumber(existing.actualAmount),
    brandName: updateData.brandName !== undefined ? (updateData.brandName?.trim() || null) : existing.brandName,
    platforms: nextPlatforms !== null ? JSON.stringify(nextPlatforms) : existing.platforms,
    acceptDate: nextAcceptDate !== undefined ? nextAcceptDate : existing.acceptDate,
    submitDate: nextSubmitDate !== undefined ? nextSubmitDate : existing.submitDate,
    productName: updateData.productName !== undefined ? (updateData.productName?.trim() || null) : existing.productName,
    productValue: updateData.productValue !== undefined ? parseAmountInput(updateData.productValue) : toNumber(existing.productValue),
  };

  if (!validateAmount(newOrder.actualAmount) || !validateAmount(newOrder.expectedAmount) || !validateAmount(newOrder.productValue)) {
    throw new Error('金额数值无效');
  }
  if (newOrder.brandName && newOrder.brandName.length > 50) {
    throw new Error('品牌名称不能超过50个字符');
  }

  const updateOrder = db.transaction(() => {
    db.prepare(`
      UPDATE orders
      SET status = ?, title = ?, type = ?, expectedAmount = ?, actualAmount = ?, brandName = ?, platforms = ?, acceptDate = ?, submitDate = ?, productName = ?, productValue = ?
      WHERE id = ? AND userId = ?
    `).run(
      newOrder.status,
      newOrder.title,
      newOrder.type,
      newOrder.expectedAmount || 0,
      newOrder.actualAmount,
      newOrder.brandName,
      newOrder.platforms,
      newOrder.acceptDate,
      newOrder.submitDate,
      newOrder.productName,
      newOrder.productValue,
      orderId,
      userId,
    );

    syncOrderDerivedRecords(newOrder, userId, updateData.operationDate);

    if (updateData.status !== undefined && newOrder.status !== existing.status) {
      logActivity(userId, 'update_status', 'order', orderId, `商单状态变更: ${existing.title} (${existing.status} -> ${newOrder.status})`);
    }
    if (updateData.title !== undefined && newOrder.title !== existing.title) {
      logActivity(userId, 'update_title', 'order', orderId, `商单标题修改: ${existing.title} -> ${newOrder.title}`);
    }
    if (updateData.actualAmount !== undefined && newOrder.actualAmount !== existing.actualAmount) {
      logActivity(userId, 'update_amount', 'order', orderId, `商单金额修改: ${existing.title} (¥${existing.actualAmount} -> ¥${newOrder.actualAmount})`);
    }
    if (updateData.brandName !== undefined && newOrder.brandName !== existing.brandName) {
      logActivity(userId, 'update_brand', 'order', orderId, `商单品牌修改: ${existing.title} (${existing.brandName || '无'} -> ${newOrder.brandName || '无'})`);
    }

    return db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as OrderRow;
  });

  return parseOrderForClient(updateOrder());
};

export const deleteOrderWithRelated = (userId: string, orderId: string) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as OrderRow | undefined;

  if (!order) {
    throw new Error('商单不存在');
  }

  // 与状态回退保持同一原则：已结算账单（实际收款）与已出售资产（交易历史）不随商单删除，
  // 保留为独立记录以便审计；其余自动派生记录一并清理。
  const deleteRelatedData = db.transaction(() => {
    logActivity(userId, 'delete', 'order', orderId, `删除商单: ${order.title} (${order.orderNo})`);
    db.prepare('DELETE FROM paid_promotions WHERE orderId = ? AND userId = ?').run(orderId, userId);
    db.prepare('DELETE FROM publish_links WHERE orderId = ? AND userId = ?').run(orderId, userId);
    db.prepare('DELETE FROM comments WHERE orderId = ? AND userId = ?').run(orderId, userId);
    db.prepare('DELETE FROM todos WHERE orderId = ? AND userId = ?').run(orderId, userId);
    db.prepare("DELETE FROM payments WHERE orderNo = ? AND userId = ? AND (type IS NULL OR type <> 'settled')")
      .run(order.orderNo, userId);
    db.prepare("DELETE FROM assets WHERE orderId = ? AND userId = ? AND (saleStatus IS NULL OR saleStatus <> 'sold')")
      .run(orderId, userId);
    db.prepare('DELETE FROM orders WHERE id = ? AND userId = ?').run(orderId, userId);
  });

  deleteRelatedData();

  const keptPayments = (db.prepare("SELECT COUNT(*) AS count FROM payments WHERE orderNo = ? AND userId = ? AND type = 'settled'")
    .get(order.orderNo, userId) as CountRow).count;
  const keptAssets = (db.prepare("SELECT COUNT(*) AS count FROM assets WHERE orderId = ? AND userId = ? AND saleStatus = 'sold'")
    .get(orderId, userId) as CountRow).count;

  return { success: true, orderNo: order.orderNo, keptPayments, keptAssets };
};

export const getOrdersByUserId = (userId: string, paging?: { limit?: number; offset?: number }) => {
  const clause = paging?.limit ? ' LIMIT ? OFFSET ?' : '';
  const orders = db.prepare(`SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC${clause}`)
    .all(...(paging?.limit ? [userId, paging.limit, paging.offset ?? 0] : [userId]));
  return (orders as OrderRow[]).map(parseOrderForClient);
};

// 列表总数：供分页接口返回 X-Total-Count（缺省全量请求时等于数组长度）
export const countOrders = (userId: string): number => (
  (db.prepare('SELECT COUNT(*) AS count FROM orders WHERE userId = ?').get(userId) as CountRow).count
);

export const getOrderById = (userId: string, orderId: string) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as OrderRow | undefined;
  return parseOrderForClient(order);
};
