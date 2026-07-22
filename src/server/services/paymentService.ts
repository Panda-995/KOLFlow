import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { logActivity } from '../routes/utils/index.js';
import { formatLocalDate, isValidDateOnly, validateAmount } from '../routes/utils/helpers.js';
import { ApiError } from './errors.js';

export type PaymentInput = {
  orderNo?: unknown;
  brand?: unknown;
  amount?: unknown;
  type?: unknown;
  date?: unknown;
  dueDate?: unknown;
  settledDate?: unknown;
  method?: unknown;
  operationDate?: unknown;
};

type PaymentRow = {
  id: string;
  userId: string;
  orderNo: string | null;
  brand: string | null;
  amount: number;
  type: string;
  date: string | null;
  dueDate: string | null;
  settledDate: string | null;
  method: string | null;
};

const normalizeOptionalText = (value: unknown, field: string, maxLength: number): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(`${field}格式无效`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ApiError(`${field}不能超过${maxLength}个字符`);
  return normalized || null;
};

const normalizeBrand = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError('品牌名称不能为空');
  const brand = value.trim();
  if (brand.length > 50) throw new ApiError('品牌名称不能超过50个字符');
  return brand;
};

const normalizePaymentType = (value: unknown): 'pending' | 'settled' => {
  if (value !== 'pending' && value !== 'settled') throw new ApiError('账单状态无效');
  return value;
};

const normalizeDate = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (!isValidDateOnly(value)) throw new ApiError('账单日期无效');
  return value;
};

const getOperationDate = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return formatLocalDate();
  if (!isValidDateOnly(value)) throw new ApiError('操作日期无效');
  return value;
};

export const listPayments = (userId: string) => (
  db.prepare('SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC').all(userId)
);

export const createPayment = (userId: string, input: PaymentInput) => {
  if (!validateAmount(input.amount)) throw new ApiError('金额数值无效');
  const brand = normalizeBrand(input.brand);
  const amount = Number(input.amount) || 0;
  const type = normalizePaymentType(input.type ?? 'pending');
  const legacyDate = normalizeDate(input.date);
  const dueDate = input.dueDate !== undefined
    ? normalizeDate(input.dueDate)
    : (type === 'pending' ? legacyDate : null);
  const requestedSettledDate = input.settledDate !== undefined
    ? normalizeDate(input.settledDate)
    : (type === 'settled' ? legacyDate : null);
  const settledDate = type === 'settled'
    ? (requestedSettledDate || getOperationDate(input.operationDate))
    : null;
  const date = type === 'settled' ? settledDate : dueDate;
  const orderNo = normalizeOptionalText(input.orderNo, '关联商单号', 100);
  const method = normalizeOptionalText(input.method, '备注', 500);
  const id = uuidv4();

  db.prepare(`
    INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, dueDate, settledDate, method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, orderNo, brand, amount, type, date, dueDate, settledDate, method);
  logActivity(userId, 'create', 'payment', id, `创建账单: ${brand} ¥${amount}`);
  return db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?').get(id, userId);
};

export const updatePaymentRecord = (userId: string, id: string, input: PaymentInput) => {
  const existing = db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?').get(id, userId) as PaymentRow | undefined;
  if (!existing) throw new ApiError('账单不存在', 404);

  const brand = input.brand !== undefined ? normalizeBrand(input.brand) : normalizeBrand(existing.brand);
  const amount = input.amount !== undefined ? Number(input.amount) : Number(existing.amount);
  if (!validateAmount(amount)) throw new ApiError('金额数值无效');
  const type = input.type !== undefined ? normalizePaymentType(input.type) : normalizePaymentType(existing.type);
  const dueDate = input.dueDate !== undefined
    ? normalizeDate(input.dueDate)
    : (input.date !== undefined && type === 'pending' ? normalizeDate(input.date) : existing.dueDate);
  let settledDate = input.settledDate !== undefined
    ? normalizeDate(input.settledDate)
    : (input.date !== undefined && type === 'settled' ? normalizeDate(input.date) : existing.settledDate);
  if (type === 'settled' && !settledDate) settledDate = getOperationDate(input.operationDate);
  if (type === 'pending') settledDate = null;
  const date = type === 'settled' ? settledDate : dueDate;
  const orderNo = input.orderNo !== undefined
    ? normalizeOptionalText(input.orderNo, '关联商单号', 100)
    : existing.orderNo;
  const method = input.method !== undefined
    ? normalizeOptionalText(input.method, '备注', 500)
    : existing.method;

  db.prepare(`
    UPDATE payments
    SET orderNo = ?, brand = ?, amount = ?, type = ?, date = ?, dueDate = ?, settledDate = ?, method = ?
    WHERE id = ? AND userId = ?
  `).run(orderNo, brand, amount, type, date, dueDate, settledDate, method, id, userId);
  logActivity(userId, 'update', 'payment', id, `更新账单: ${brand} ¥${amount}`);
  return db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?').get(id, userId);
};

export const deletePaymentRecord = (userId: string, id: string) => {
  const existing = db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?').get(id, userId) as PaymentRow | undefined;
  if (!existing) throw new ApiError('账单不存在', 404);
  db.prepare('DELETE FROM payments WHERE id = ? AND userId = ?').run(id, userId);
  logActivity(userId, 'delete', 'payment', id, `删除账单: ${existing.brand || '未知品牌'} ¥${existing.amount}`);
  return { success: true };
};
