import { Router } from 'express';
import {
  getOrdersByUserId,
  countOrders,
  createOrderWithTodo,
  updateOrderWithSync,
  deleteOrderWithRelated
} from '../services/orderService.js';
import { getUserId } from './utils/index.js';
import { parseListPaging } from './utils/helpers.js';

const router = Router();

// 获取商单列表（支持 ?limit=&offset=，响应头 X-Total-Count 给出总数；
// 不传分页参数时仍返回全量，保持既有调用方行为）
router.get('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const orders = getOrdersByUserId(userId, parseListPaging(req.query));
    res.setHeader('X-Total-Count', String(countOrders(userId)));
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
    const { title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue, operationDate } = req.body;

    const newOrder = createOrderWithTodo(userId, {
      title,
      type,
      status,
      expectedAmount,
      actualAmount,
      brandName,
      platforms,
      acceptDate,
      submitDate,
      productName,
      productValue,
      operationDate
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
    const { status, title, type, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue, operationDate } = req.body;

    const updatedOrder = updateOrderWithSync(userId, id, {
      status,
      title,
      type,
      expectedAmount,
      actualAmount,
      brandName,
      platforms,
      acceptDate,
      submitDate,
      productName,
      productValue,
      operationDate
    });

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
