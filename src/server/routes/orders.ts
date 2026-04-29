import { Router } from 'express';
import {
  getOrdersByUserId,
  createOrderWithTodo,
  updateOrderWithSync,
  deleteOrderWithRelated,
  autoCreatePaymentIfCompleted
} from '../services/orderService.js';
import { getUserId } from './utils/index.js';

const router = Router();

// 获取所有商单
router.get('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const orders = getOrdersByUserId(userId);
    res.json(orders);
  } catch (error) {
    console.error('获取商单列表错误:', error instanceof Error ? error.message : error);
    res.status(500).json({ 
      error: '获取商单列表失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

// 创建商单
router.post('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const { title, type, actualAmount, brandName, platforms, acceptDate, submitDate } = req.body;

    const newOrder = createOrderWithTodo(userId, {
      title,
      type,
      actualAmount,
      brandName,
      platforms,
      acceptDate,
      submitDate
    });

    res.json(newOrder);
  } catch (error) {
    console.error('创建商单错误:', error);
    const message = error instanceof Error ? error.message : '创建商单失败，请稍后重试';
    res.status(400).json({ error: message });
  }
});

// 更新商单
router.put('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { status, title, type, actualAmount, brandName, platforms, acceptDate, submitDate } = req.body;

    const updatedOrder = updateOrderWithSync(userId, id, {
      status,
      title,
      type,
      actualAmount,
      brandName,
      platforms,
      acceptDate,
      submitDate
    });

    // 商单完成时自动创建账单
    autoCreatePaymentIfCompleted(updatedOrder, userId);

    res.json(updatedOrder);
  } catch (error) {
    console.error('更新商单错误:', error);
    const message = error instanceof Error ? error.message : '更新商单失败，请稍后重试';
    res.status(400).json({ error: message });
  }
});

// 删除商单
router.delete('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const result = deleteOrderWithRelated(userId, id);
    res.json(result);
  } catch (error) {
    console.error('删除商单错误:', error);
    const message = error instanceof Error ? error.message : '删除商单失败，请稍后重试';
    res.status(400).json({ error: message });
  }
});

export default router;