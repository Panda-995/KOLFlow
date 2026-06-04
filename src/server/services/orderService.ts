import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logActivity } from '../routes/utils/index.js';
import { validateAmount, generateOrderNo, safeJsonParse } from '../routes/utils/helpers.js';

type OrderRow = {
  id: string;
  userId: string;
  orderNo: string;
  title: string;
  type: string;
  status: string;
  expectedAmount?: number;
  actualAmount: number;
  brandName: string | null;
  platforms: string | string[] | null;
  acceptDate: string | null;
  submitDate: string | null;
  productName: string | null;
  productValue: number;
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
};

type OrderUpdate = Partial<OrderInput>;

const isExchangeType = (type: string | null | undefined): boolean => {
  return type === 'product_exchange' || type === 'ecard';
};

const isMonetaryType = (type: string | null | undefined): boolean => {
  return !isExchangeType(type || '');
};

const toNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeOrder = (order: any): OrderRow => ({
  ...order,
  actualAmount: toNumber(order.actualAmount),
  productValue: toNumber(order.productValue),
});

const parseOrderForClient = (order: any) => {
  if (!order) return order;
  return {
    ...order,
    platforms: Array.isArray(order.platforms) ? order.platforms : safeJsonParse(order.platforms, []),
  };
};

const getBrandId = (userId: string, brandName: string | null): string | null => {
  if (!brandName) return null;
  const brand = db.prepare('SELECT id FROM brands WHERE name = ? AND userId = ?').get(brandName, userId) as any;
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
  `).get(order.id, userId) as any;

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

const upsertPaymentFromOrder = (order: OrderRow, userId: string): string | null => {
  if (order.status !== 'completed' || !isMonetaryType(order.type) || toNumber(order.actualAmount) <= 0) {
    db.prepare('DELETE FROM payments WHERE orderNo = ? AND userId = ?').run(order.orderNo, userId);
    return null;
  }

  const existing = db.prepare('SELECT * FROM payments WHERE orderNo = ? AND userId = ?').get(order.orderNo, userId) as any;
  if (existing) {
    db.prepare(`
      UPDATE payments
      SET brand = ?, amount = ?
      WHERE id = ? AND userId = ?
    `).run(order.brandName || null, order.actualAmount, existing.id, userId);
    return existing.id;
  }

  const paymentId = uuidv4();
  db.prepare(`
    INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    paymentId,
    userId,
    order.orderNo,
    order.brandName || null,
    order.actualAmount,
    'pending',
    new Date().toISOString().split('T')[0],
    '待结算',
  );
  logActivity(userId, 'auto_create', 'payment', paymentId, `商单完成自动创建账单: ${order.brandName || '未知品牌'} ¥${order.actualAmount}`);
  return paymentId;
};

const upsertAssetFromOrder = (order: OrderRow, userId: string): string | null => {
  if (order.status !== 'completed' || !isExchangeType(order.type)) {
    db.prepare('DELETE FROM assets WHERE orderId = ? AND userId = ?').run(order.id, userId);
    return null;
  }

  const productName = getAssetProductName(order);
  const productValue = toNumber(order.productValue);
  const existing = db.prepare('SELECT * FROM assets WHERE orderId = ? AND userId = ?').get(order.id, userId) as any;
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

export const syncOrderDerivedRecords = (order: any, userId: string): void => {
  const normalizedOrder = normalizeOrder(order);
  syncOrderTodo(normalizedOrder, userId);
  upsertPaymentFromOrder(normalizedOrder, userId);
  upsertAssetFromOrder(normalizedOrder, userId);
};

export const createOrderWithTodo = (userId: string, orderData: OrderInput) => {
  const { title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue } = orderData;

  if (!title || title.trim().length === 0) {
    throw new Error('商单标题不能为空');
  }
  if (title.length > 100) {
    throw new Error('商单标题不能超过100个字符');
  }
  if (!validateAmount(actualAmount) || !validateAmount(expectedAmount) || !validateAmount(productValue)) {
    throw new Error('金额数值无效');
  }
  if (brandName && brandName.length > 50) {
    throw new Error('品牌名称不能超过50个字符');
  }
  if (platforms && platforms.length > 10) {
    throw new Error('平台数量不能超过10个');
  }

  const id = uuidv4();
  const orderNo = generateOrderNo();
  const normalizedStatus = status || 'in_progress';
  const normalizedType = type || 'paid';

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
      toNumber(expectedAmount),
      toNumber(actualAmount),
      brandName?.trim() || null,
      JSON.stringify(platforms || []),
      acceptDate || null,
      submitDate || null,
      productName?.trim() || null,
      toNumber(productValue),
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
      submitDate || null,
      id,
      brandId,
    );

    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(id, userId) as any;
    syncOrderDerivedRecords(order, userId);
    logActivity(userId, 'create', 'order', id, `创建商单: ${title.trim()} (${orderNo})`);
    return order;
  });

  return parseOrderForClient(createOrder());
};

export const updateOrderWithSync = (userId: string, orderId: string, updateData: OrderUpdate) => {
  const existingOrder = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as any;
  if (!existingOrder) {
    throw new Error('商单不存在');
  }

  const existing = normalizeOrder(existingOrder);
  const newTitle = updateData.title !== undefined ? updateData.title.trim() : existing.title;
  if (!newTitle) {
    throw new Error('商单标题不能为空');
  }
  if (newTitle.length > 100) {
    throw new Error('商单标题不能超过100个字符');
  }

  const newOrder: OrderRow = {
    ...existing,
    status: updateData.status || existing.status,
    title: newTitle,
    type: updateData.type || existing.type,
    expectedAmount: updateData.expectedAmount !== undefined ? toNumber(updateData.expectedAmount) : toNumber(existing.expectedAmount),
    actualAmount: updateData.actualAmount !== undefined ? toNumber(updateData.actualAmount) : toNumber(existing.actualAmount),
    brandName: updateData.brandName !== undefined ? (updateData.brandName?.trim() || null) : existing.brandName,
    platforms: updateData.platforms !== undefined ? JSON.stringify(updateData.platforms || []) : existing.platforms,
    acceptDate: updateData.acceptDate !== undefined ? (updateData.acceptDate || null) : existing.acceptDate,
    submitDate: updateData.submitDate !== undefined ? (updateData.submitDate || null) : existing.submitDate,
    productName: updateData.productName !== undefined ? (updateData.productName?.trim() || null) : existing.productName,
    productValue: updateData.productValue !== undefined ? toNumber(updateData.productValue) : toNumber(existing.productValue),
  };

  if (!validateAmount(newOrder.actualAmount) || !validateAmount(newOrder.expectedAmount) || !validateAmount(newOrder.productValue)) {
    throw new Error('金额数值无效');
  }
  if (newOrder.brandName && newOrder.brandName.length > 50) {
    throw new Error('品牌名称不能超过50个字符');
  }
  if (updateData.platforms && updateData.platforms.length > 10) {
    throw new Error('平台数量不能超过10个');
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

    syncOrderDerivedRecords(newOrder, userId);

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

    return db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as any;
  });

  return parseOrderForClient(updateOrder());
};

export const autoCreatePaymentIfCompleted = (order: any, userId: string) => {
  const normalizedOrder = normalizeOrder(order);
  return upsertPaymentFromOrder(normalizedOrder, userId);
};

export const autoCreateAssetIfExchange = (order: any, userId: string) => {
  const normalizedOrder = normalizeOrder(order);
  return upsertAssetFromOrder(normalizedOrder, userId);
};

export const deleteOrderWithRelated = (userId: string, orderId: string) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as any;

  if (!order) {
    throw new Error('商单不存在');
  }

  const deleteRelatedData = db.transaction(() => {
    logActivity(userId, 'delete', 'order', orderId, `删除商单: ${order.title} (${order.orderNo})`);
    db.prepare('DELETE FROM paid_promotions WHERE orderId = ? AND userId = ?').run(orderId, userId);
    db.prepare('DELETE FROM publish_links WHERE orderId = ? AND userId = ?').run(orderId, userId);
    db.prepare('DELETE FROM comments WHERE orderId = ? AND userId = ?').run(orderId, userId);
    db.prepare('DELETE FROM todos WHERE orderId = ? AND userId = ?').run(orderId, userId);
    db.prepare('DELETE FROM payments WHERE orderNo = ? AND userId = ?').run(order.orderNo, userId);
    db.prepare('DELETE FROM assets WHERE orderId = ? AND userId = ?').run(orderId, userId);
    db.prepare('DELETE FROM orders WHERE id = ? AND userId = ?').run(orderId, userId);
  });

  deleteRelatedData();

  return { success: true, orderNo: order.orderNo };
};

export const getOrdersByUserId = (userId: string) => {
  const orders = db.prepare('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  return orders.map(parseOrderForClient);
};

export const getOrderById = (userId: string, orderId: string) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as any;
  return parseOrderForClient(order);
};
