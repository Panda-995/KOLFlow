import { Router } from 'express';
import db from '../db.js';
import { getUserId } from './utils/index.js';
import { safeJsonParse } from './utils/helpers.js';

const router = Router();

// 获取报告
router.get('/:type', (req, res) => {
  const userId = getUserId(req);
  const { type } = req.params;
  const now = new Date();
  let startDate: Date;

  if (type === 'weekly') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    // 月度报告：使用月初作为起始点，避免日期偏移问题
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  }

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = now.toISOString().split('T')[0];

  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE userId = ? AND acceptDate >= ? AND acceptDate <= ?
    ORDER BY acceptDate DESC
  `).all(userId, startDateStr, endDateStr) as any[];

  const payments = db.prepare(`
    SELECT * FROM payments
    WHERE userId = ? AND date >= ? AND date <= ?
    ORDER BY date DESC
  `).all(userId, startDateStr, endDateStr) as any[];

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

  const brandStats: Record<string, { orders: number; income: number }> = {};
  orders.forEach(o => {
    if (o.brandName) {
      if (!brandStats[o.brandName]) {
        brandStats[o.brandName] = { orders: 0, income: 0 };
      }
      brandStats[o.brandName].orders++;
      if (o.status === 'completed') {
        brandStats[o.brandName].income += o.actualAmount;
      }
    }
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
    summary: { totalOrders, completedOrders, totalIncome, pendingIncome },
    brandStats,
    orders: orders.map(o => ({ ...o, platforms: safeJsonParse(o.platforms, []) })),
    payments
  });
});

export default router;