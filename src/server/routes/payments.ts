import { Router } from 'express';
import db from '../db.js';
import { logActivity, getUserId } from './utils/index.js';
import { formatLocalDate, isValidDateOnly, parseListPaging } from './utils/helpers.js';
import { createPayment, countPayments, deletePaymentRecord, listPayments, updatePaymentRecord } from '../services/paymentService.js';
import { getApiErrorMessage, getApiErrorStatus } from '../services/errors.js';
import type { PaymentRow } from '../dbRows.js';

const router = Router();

// 获取所有账单
router.get('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const payments = listPayments(userId, parseListPaging(req.query));
    res.setHeader('X-Total-Count', String(countPayments(userId)));
    return res.json(payments);
  } catch (error) {
    console.error('获取账单列表错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '获取账单列表失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

// 创建账单
router.post('/', (req, res) => {
  try {
    return res.json(createPayment(getUserId(req), req.body));
  } catch (error) {
    console.error('创建账单错误:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '创建账单失败，请稍后重试') });
  }
});

// 结算账单
router.put('/:id/settle', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?').get(id, userId) as PaymentRow | undefined;

    if (!payment) {
      return res.status(404).json({ error: '账单不存在' });
    }

    // 明确目标状态优先（settled: true/false，幂等）；未提供时保持切换语义兼容旧调用
    const requestedSettled = req.body?.settled;
    const requestedType = requestedSettled === true ? 'settled' : requestedSettled === false ? 'pending' : null;
    const newType = requestedType ?? (payment.type === 'pending' ? 'settled' : 'pending');

    if (payment.type === newType) {
      // 幂等：重复请求不回退状态、不改写结算日期
      return res.json(payment);
    }

    const requestedDate = req.body?.settledDate;
    // 取消结算时若旧数据没有 dueDate，回退到原 date 列，避免结算历史日期被清空
    const dueDate = payment.dueDate || payment.date || null;
    const settledDate = newType === 'settled'
      ? (isValidDateOnly(requestedDate) ? requestedDate : formatLocalDate())
      : null;
    const newDate = newType === 'settled' ? settledDate : dueDate;

    db.prepare('UPDATE payments SET type = ?, date = ?, dueDate = ?, settledDate = ? WHERE id = ? AND userId = ?')
      .run(newType, newDate, dueDate, settledDate, id, userId);

    logActivity(userId, 'settle', 'payment', id, `账单结算: ${payment.brand} ¥${payment.amount} (${payment.type} → ${newType})`);

    const updatedPayment = db.prepare('SELECT * FROM payments WHERE id = ? AND userId = ?').get(id, userId);
    return res.json(updatedPayment);
  } catch (error) {
    console.error('结算账单错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '结算账单失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

// 更新账单
router.put('/:id', (req, res) => {
  try {
    return res.json(updatePaymentRecord(getUserId(req), req.params.id, req.body));
  } catch (error) {
    console.error('更新账单错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '更新账单失败，请稍后重试') });
  }
});

// 删除账单
router.delete('/:id', (req, res) => {
  try {
    return res.json(deletePaymentRecord(getUserId(req), req.params.id));
  } catch (error) {
    console.error('删除账单错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '删除账单失败，请稍后重试') });
  }
});

export default router;
