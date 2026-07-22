import { Router } from 'express';
import db from '../db.js';
import { getUserId } from './utils/index.js';
import { safeJsonParse } from './utils/helpers.js';

const router = Router();

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 获取报告
router.get('/:type', (req, res) => {
  const userId = getUserId(req);
  const { type } = req.params;
  const now = new Date();
  let startDate: Date;

  if (type === 'weekly') {
    startDate = new Date(now);
    const dayOfWeek = startDate.getDay() || 7;
    startDate.setDate(startDate.getDate() - dayOfWeek + 1);
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const startDateStr = formatLocalDate(startDate);
  const endDateStr = formatLocalDate(now);

  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE userId = ? AND acceptDate >= ? AND acceptDate <= ?
    ORDER BY acceptDate DESC
  `).all(userId, startDateStr, endDateStr) as any[];

  const payments = db.prepare(`
    SELECT * FROM payments
    WHERE userId = ? AND (
      (type = 'settled' AND COALESCE(settledDate, date) >= ? AND COALESCE(settledDate, date) <= ?)
      OR
      (type = 'pending' AND COALESCE(dueDate, date) >= ? AND COALESCE(dueDate, date) <= ?)
    )
    ORDER BY COALESCE(settledDate, dueDate, date) DESC
  `).all(userId, startDateStr, endDateStr, startDateStr, endDateStr) as any[];

  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.status === 'completed').length;
  const paymentIncome = payments.filter(p => p.type === 'settled').reduce((sum, p) => sum + p.amount, 0);
  const pendingIncome = payments.filter(p => p.type === 'pending').reduce((sum, p) => sum + p.amount, 0);

  const soldAssets = db.prepare(`
    SELECT * FROM assets
    WHERE userId = ? AND saleStatus = 'sold' AND soldDate >= ? AND soldDate <= ?
  `).all(userId, startDateStr, endDateStr) as any[];
  const assetIncome = soldAssets.reduce((sum, a) => sum + (a.soldAmount || 0), 0);
  const totalIncome = paymentIncome + assetIncome;

  const paidPromotions = db.prepare(`
    SELECT pp.* FROM paid_promotions pp
    LEFT JOIN orders o ON pp.orderId = o.id AND pp.userId = o.userId
    WHERE pp.userId = ?
      AND COALESCE(o.acceptDate, substr(pp.createdAt, 1, 10)) >= ?
      AND COALESCE(o.acceptDate, substr(pp.createdAt, 1, 10)) <= ?
    ORDER BY pp.createdAt DESC
  `).all(userId, startDateStr, endDateStr) as any[];
  const paidPromotionTotal = paidPromotions.reduce((sum, record) => sum + (record.amount || 0), 0);

  const brandStats: Record<string, { orders: number; income: number }> = {};
  orders.forEach(o => {
    if (o.brandName) {
      if (!brandStats[o.brandName]) {
        brandStats[o.brandName] = { orders: 0, income: 0 };
      }
      brandStats[o.brandName].orders++;
    }
  });

  payments.forEach(p => {
    if (p.type !== 'settled' || !p.brand) return;
    if (!brandStats[p.brand]) {
      brandStats[p.brand] = { orders: 0, income: 0 };
    }
    brandStats[p.brand].income += p.amount;
  });

  soldAssets.forEach(a => {
    if (a.brandName && a.soldAmount > 0) {
      if (!brandStats[a.brandName]) {
        brandStats[a.brandName] = { orders: 0, income: 0 };
      }
      brandStats[a.brandName].income += a.soldAmount;
    }
  });

  res.json({
    period: { start: startDateStr, end: endDateStr, type },
    summary: { totalOrders, completedOrders, totalIncome, pendingIncome, paidPromotionTotal },
    brandStats,
    orders: orders.map(o => ({ ...o, platforms: safeJsonParse(o.platforms, []) })),
    payments,
    paidPromotions
  });
});

export default router;
