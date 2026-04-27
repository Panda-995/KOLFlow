import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { getUserId } from './utils/index.js';
import { safeJsonParse } from './utils/helpers.js';
import { autoCreatePaymentIfCompleted } from '../services/orderService.js';

const router = Router();

// 获取所有待办
router.get('/', (req, res) => {
  const userId = getUserId(req);
  const todos = db.prepare(`
    SELECT t.*, o.status as orderStatus, o.orderNo as orderNo
    FROM todos t
    LEFT JOIN orders o ON t.orderId = o.id AND o.userId = t.userId
    WHERE t.userId = ?
    ORDER BY t.createdAt DESC
  `).all(userId);
  res.json(todos.map((t: any) => ({ ...t, completed: Boolean(t.completed) })));
});

// 创建待办
router.post('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const { content, priority, dueDate, orderId, brandId, category } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: '待办内容不能为空' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, content.trim(), priority || 'medium', category || null, 0, dueDate || null, orderId || null, brandId || null);

    const newTodo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    newTodo.completed = Boolean(newTodo.completed);
    res.json(newTodo);
  } catch (error) {
    console.error('创建待办错误:', error);
    res.status(500).json({ error: '创建待办失败，请稍后重试' });
  }
});

// 更新待办
router.put('/:id/update', (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const { content, priority, category, completed, dueDate, brandId } = req.body;

  const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND userId = ?').get(id, userId) as any;
  if (!existing) return res.status(404).json({ error: '待办事项不存在' });

  const newContent = content !== undefined ? content : existing.content;
  const newPriority = priority !== undefined ? priority : existing.priority;
  const newCategory = category !== undefined ? category : existing.category;
  const newCompleted = completed !== undefined ? (completed ? 1 : 0) : existing.completed;
  const newDueDate = dueDate !== undefined ? dueDate : existing.dueDate;
  const newBrandId = brandId !== undefined ? brandId : existing.brandId;

  db.prepare(`
    UPDATE todos
    SET content = ?, priority = ?, category = ?, completed = ?, dueDate = ?, brandId = ?
    WHERE id = ?
  `).run(newContent, newPriority, newCategory, newCompleted, newDueDate, newBrandId, id);

  // 同步商单状态 - 只有当订单的所有待办都完成时才将订单设为完成
  if (existing.orderId) {
    if (newCompleted === 1) {
      const allTodos = db.prepare('SELECT id, completed FROM todos WHERE orderId = ? AND userId = ?').all(existing.orderId, userId) as any[];
      const allCompleted = allTodos.every(t => t.completed === 1);
      if (allCompleted && allTodos.length > 0) {
        db.prepare('UPDATE orders SET status = ? WHERE id = ? AND userId = ?').run('completed', existing.orderId, userId);
        // 商单完成时自动创建账单
        const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(existing.orderId, userId) as any;
        autoCreatePaymentIfCompleted(order, userId);
      }
    } else if (newCompleted === 0) {
      const order = db.prepare('SELECT status FROM orders WHERE id = ? AND userId = ?').get(existing.orderId, userId) as any;
      if (order && order.status === 'completed') {
        db.prepare('UPDATE orders SET status = ? WHERE id = ? AND userId = ?').run('in_progress', existing.orderId, userId);
      }
    }
  }

  const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
  updated.completed = Boolean(updated.completed);
  res.json(updated);
});

// 切换待办状态
router.put('/:id/toggle', (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const todo = db.prepare('SELECT completed, orderId FROM todos WHERE id = ? AND userId = ?').get(id, userId) as any;
  if (todo) {
    const newStatus = todo.completed ? 0 : 1;
    db.prepare('UPDATE todos SET completed = ? WHERE id = ? AND userId = ?').run(newStatus, id, userId);

    // 同步商单状态 - 只有当订单的所有待办都完成时才将订单设为完成
    if (todo.orderId) {
      if (newStatus === 1) {
        // 查询所有待办，并考虑当前todo的新状态
        const allTodos = db.prepare('SELECT id, completed FROM todos WHERE orderId = ? AND userId = ?').all(todo.orderId, userId) as any[];
        // 使用新状态来判断当前todo是否完成
        const allCompleted = allTodos.every(t => t.id === id ? newStatus === 1 : t.completed === 1);
        if (allCompleted && allTodos.length > 0) {
          db.prepare('UPDATE orders SET status = ? WHERE id = ? AND userId = ?').run('completed', todo.orderId, userId);
          // 商单完成时自动创建账单
          const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(todo.orderId, userId) as any;
          autoCreatePaymentIfCompleted(order, userId);
        }
      } else {
        const order = db.prepare('SELECT status FROM orders WHERE id = ? AND userId = ?').get(todo.orderId, userId) as any;
        if (order && order.status === 'completed') {
          db.prepare('UPDATE orders SET status = ? WHERE id = ? AND userId = ?').run('in_progress', todo.orderId, userId);
        }
      }
    }

    const updatedTodo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    updatedTodo.completed = Boolean(updatedTodo.completed);
    res.json(updatedTodo);
  } else {
    res.status(404).json({ error: '未找到待办事项' });
  }
});

// 删除待办
router.delete('/:id', (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const todo = db.prepare('SELECT id FROM todos WHERE id = ? AND userId = ?').get(id, userId);
  if (!todo) {
    return res.status(404).json({ error: '待办事项不存在' });
  }
  db.prepare('DELETE FROM todos WHERE id = ? AND userId = ?').run(id, userId);
  res.json({ success: true });
});

export default router;