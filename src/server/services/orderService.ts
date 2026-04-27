// 订单公共服务模块 - 消除重复代码

import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logActivity } from '../routes/utils/index.js';
import { validateAmount, generateOrderNo, safeJsonParse } from '../routes/utils/helpers.js';

// 创建商单并自动创建关联待办
export const createOrderWithTodo = (userId: string, orderData: {
  title: string;
  type?: string;
  actualAmount?: number;
  brandName?: string;
  platforms?: string[];
  acceptDate?: string;
  submitDate?: string;
}) => {
  const { title, type, actualAmount, brandName, platforms, acceptDate, submitDate } = orderData;

  // 验证
  if (!title || title.trim().length === 0) {
    throw new Error('商单标题不能为空');
  }
  if (title.length > 100) {
    throw new Error('商单标题不能超过100个字符');
  }
  if (!validateAmount(actualAmount)) {
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

  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, orderNo, title.trim(), type || 'paid', 'in_progress', 0, actualAmount || 0, brandName || null, JSON.stringify(platforms || []), acceptDate || null, submitDate || null);

  logActivity(userId, 'create', 'order', id, `创建商单: ${title} (${orderNo})`);

  // 关联品牌
  let brandId = null;
  if (brandName) {
    const brand = db.prepare('SELECT id FROM brands WHERE name = ? AND userId = ?').get(brandName, userId) as any;
    if (brand) brandId = brand.id;
  }

  // 创建对应待办
  const todoId = uuidv4();
  db.prepare(`
    INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(todoId, userId, `商单任务: ${title}`, 'high', brandName || null, 0, submitDate || null, id, brandId);

  const newOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any;
  newOrder.platforms = safeJsonParse(newOrder.platforms, []);
  return newOrder;
};

// 更新商单并同步关联数据
export const updateOrderWithSync = (userId: string, orderId: string, updateData: {
  status?: string;
  title?: string;
  type?: string;
  actualAmount?: number;
  brandName?: string;
  platforms?: string[];
  acceptDate?: string;
  submitDate?: string;
}) => {
  const existingOrder = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as any;
  if (!existingOrder) {
    throw new Error('商单不存在');
  }

  const { status, title, type, actualAmount, brandName, platforms, acceptDate, submitDate } = updateData;

  const newStatus = status || existingOrder.status;
  const newTitle = title || existingOrder.title;
  const newType = type || existingOrder.type;
  const newActualAmount = actualAmount !== undefined ? actualAmount : existingOrder.actualAmount;
  const newBrandName = brandName || existingOrder.brandName;
  const newPlatforms = platforms ? JSON.stringify(platforms) : existingOrder.platforms;
  const newAcceptDate = acceptDate || existingOrder.acceptDate;
  const newSubmitDate = submitDate || existingOrder.submitDate;

  db.prepare(`
    UPDATE orders
    SET status = ?, title = ?, type = ?, actualAmount = ?, brandName = ?, platforms = ?, acceptDate = ?, submitDate = ?
    WHERE id = ?
  `).run(newStatus, newTitle, newType, newActualAmount, newBrandName, newPlatforms, newAcceptDate, newSubmitDate, orderId);

  // 操作日志
  if (status && status !== existingOrder.status) {
    logActivity(userId, 'update_status', 'order', orderId, `商单状态变更: ${existingOrder.title} (${existingOrder.status} → ${newStatus})`);
  }
  if (title && title !== existingOrder.title) {
    logActivity(userId, 'update_title', 'order', orderId, `商单标题修改: ${existingOrder.title} → ${newTitle}`);
  }
  if (actualAmount !== undefined && actualAmount !== existingOrder.actualAmount) {
    logActivity(userId, 'update_amount', 'order', orderId, `商单金额修改: ${existingOrder.title} (¥${existingOrder.actualAmount} → ¥${newActualAmount})`);
  }
  if (brandName && brandName !== existingOrder.brandName) {
    logActivity(userId, 'update_brand', 'order', orderId, `商单品牌修改: ${existingOrder.title} (${existingOrder.brandName || '无'} → ${newBrandName})`);
  }

  // 同步关联待办
  let brandId = null;
  if (newBrandName) {
    const brand = db.prepare('SELECT id FROM brands WHERE name = ? AND userId = ?').get(newBrandName, userId) as any;
    if (brand) brandId = brand.id;
  }

  if (newStatus === 'completed') {
    db.prepare('UPDATE todos SET completed = 1, content = ?, dueDate = ?, category = ?, brandId = ? WHERE orderId = ?')
      .run(`商单任务: ${newTitle}`, newSubmitDate, newBrandName || null, brandId, orderId);
  } else {
    db.prepare('UPDATE todos SET content = ?, dueDate = ?, category = ?, brandId = ? WHERE orderId = ?')
      .run(`商单任务: ${newTitle}`, newSubmitDate, newBrandName || null, brandId, orderId);
  }

  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (updatedOrder) {
    updatedOrder.platforms = safeJsonParse(updatedOrder.platforms, []);
  }
  return updatedOrder;
};

// 商单完成时自动创建账单
export const autoCreatePaymentIfCompleted = (order: any, userId: string) => {
  if (order.status === 'completed' && order.actualAmount > 0) {
    const existingPayment = db.prepare('SELECT id FROM payments WHERE orderNo = ? AND userId = ?').get(order.orderNo, userId);
    if (!existingPayment) {
      const paymentId = uuidv4();
      db.prepare(`
        INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(paymentId, userId, order.orderNo, order.brandName || null, order.actualAmount, 'pending', new Date().toISOString().split('T')[0], '待结算');
      logActivity(userId, 'auto_create', 'payment', paymentId, `商单完成自动创建账单: ${order.brandName || '未知品牌'} ¥${order.actualAmount}`);
      return paymentId;
    }
  }
  return null;
};

// 删除商单及关联数据
export const deleteOrderWithRelated = (userId: string, orderId: string) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as any;

  if (!order) {
    throw new Error('商单不存在');
  }

  logActivity(userId, 'delete', 'order', orderId, `删除商单: ${order.title} (${order.orderNo})`);
  db.prepare('DELETE FROM payments WHERE orderNo = ? AND userId = ?').run(order.orderNo, userId);
  db.prepare('DELETE FROM orders WHERE id = ? AND userId = ?').run(orderId, userId);
  db.prepare('DELETE FROM todos WHERE orderId = ? AND userId = ?').run(orderId, userId);
  db.prepare('DELETE FROM publish_links WHERE orderId = ? AND userId = ?').run(orderId, userId);
  db.prepare('DELETE FROM comments WHERE orderId = ? AND userId = ?').run(orderId, userId);

  return { success: true, orderNo: order.orderNo };
};

// 获取用户订单列表
export const getOrdersByUserId = (userId: string) => {
  const orders = db.prepare('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  return orders.map((o: any) => ({ ...o, platforms: safeJsonParse(o.platforms, []) }));
};

// 获取单个订单
export const getOrderById = (userId: string, orderId: string) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as any;
  if (order) {
    order.platforms = safeJsonParse(order.platforms, []);
  }
  return order;
};