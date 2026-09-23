import { Router } from 'express';
import db from '../db.js';
import { getUserId } from './utils/index.js';
import { getOrdersByUserId } from '../services/orderService.js';
import { listUpcomingTodos } from '../services/todoService.js';
import { isValidDateOnly, safeJsonParse } from './utils/helpers.js';
import type { OrderRow, PaymentRow } from '../dbRows.js';

const router = Router();

router.get('/', (req, res) => {
  const userId = getUserId(req);
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: '年月参数无效' });
  }
  const thisMonth = `${year}-${String(month).padStart(2, '0')}`;
  const previous = new Date(year, month - 2, 1);
  const lastMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
  const income = (table: 'payments' | 'assets', prefix: string): number => {
    const sql = table === 'payments'
      ? "SELECT SUM(amount) AS total FROM payments WHERE userId = ? AND type = 'settled' AND COALESCE(NULLIF(settledDate, ''), date) LIKE ?"
      : "SELECT SUM(soldAmount) AS total FROM assets WHERE userId = ? AND saleStatus = 'sold' AND soldDate LIKE ?";
    const row = db.prepare(sql).get(userId, `${prefix}%`) as { total: number | null };
    return row.total ?? 0;
  };
  const orderCounts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN acceptDate LIKE ? THEN 1 ELSE 0 END) AS currentTotal,
      SUM(CASE WHEN acceptDate LIKE ? AND status = 'completed' THEN 1 ELSE 0 END) AS currentCompleted,
      SUM(CASE WHEN acceptDate LIKE ? THEN 1 ELSE 0 END) AS lastTotal,
      SUM(CASE WHEN acceptDate LIKE ? AND status = 'completed' THEN 1 ELSE 0 END) AS lastCompleted
    FROM orders WHERE userId = ?
  `).get(`${thisMonth}%`, `${thisMonth}%`, `${lastMonth}%`, `${lastMonth}%`, userId) as Record<string, number | null>;
  const currentTotal = orderCounts.currentTotal ?? 0;
  const lastTotal = orderCounts.lastTotal ?? 0;
  const completionRate = currentTotal ? Math.round(((orderCounts.currentCompleted ?? 0) / currentTotal) * 100) : 0;
  const lastRate = lastTotal ? Math.round(((orderCounts.lastCompleted ?? 0) / lastTotal) * 100) : 0;
  const paymentMonths = db.prepare(`
    SELECT substr(COALESCE(NULLIF(settledDate, ''), date), 1, 7) AS month, SUM(amount) AS amount
    FROM payments WHERE userId = ? AND type = 'settled' AND COALESCE(NULLIF(settledDate, ''), date) LIKE ?
    GROUP BY substr(COALESCE(NULLIF(settledDate, ''), date), 1, 7)
  `).all(userId, `${year}-%`) as Array<{ month: string; amount: number }>;
  const assetMonths = db.prepare(`
    SELECT substr(soldDate, 1, 7) AS month, SUM(soldAmount) AS amount
    FROM assets WHERE userId = ? AND saleStatus = 'sold' AND soldDate LIKE ?
    GROUP BY substr(soldDate, 1, 7)
  `).all(userId, `${year}-%`) as Array<{ month: string; amount: number }>;
  const incomeByMonth = new Map<string, number>();
  for (const row of [...paymentMonths, ...assetMonths]) {
    incomeByMonth.set(row.month, (incomeByMonth.get(row.month) ?? 0) + row.amount);
  }
  const monthlyStats = Array.from({ length: month }, (_, index) => ({
    name: `${index + 1}月`,
    monthIndex: index,
    income: Math.round((incomeByMonth.get(`${year}-${String(index + 1).padStart(2, '0')}`) ?? 0) * 100) / 100,
  }));
  const round = (value: number) => Math.round(value * 100) / 100;
  return res.json({
    monthlyIncome: round(income('payments', thisMonth) + income('assets', thisMonth)),
    lastMonthIncome: round(income('payments', lastMonth) + income('assets', lastMonth)),
    completedOrders: orderCounts.completed ?? 0,
    pendingOrders: orderCounts.pending ?? 0,
    completionRate,
    completionRateChange: currentTotal && lastTotal ? completionRate - lastRate : 0,
    newOrdersThisMonth: currentTotal,
    thisMonthOrderCount: currentTotal,
    monthlyStats,
    recentOrders: getOrdersByUserId(userId, { limit: 5, offset: 0 }),
    recentTodos: listUpcomingTodos(userId, 6),
  });
});

router.get('/notification-candidates', (req, res) => {
  const userId = getUserId(req);
  if (req.query.today !== undefined && !isValidDateOnly(req.query.today)) {
    return res.status(400).json({ error: '日期参数无效' });
  }
  const today = typeof req.query.today === 'string'
    ? req.query.today : new Date().toISOString().slice(0, 10);
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 3);
  const endDate = end.toISOString().slice(0, 10);
  const orders = db.prepare(`
    SELECT * FROM orders WHERE userId = ? AND status NOT IN ('completed', 'cancelled')
      AND submitDate IS NOT NULL AND submitDate <= ?
  `).all(userId, endDate) as OrderRow[];
  const payments = db.prepare(`
    SELECT * FROM payments WHERE userId = ? AND type = 'pending'
      AND COALESCE(NULLIF(dueDate, ''), date) < ?
  `).all(userId, today) as PaymentRow[];
  return res.json({
    orders: orders.map(order => ({ ...order, platforms: safeJsonParse(order.platforms, []) })),
    payments,
  });
});

export default router;
