import { Router } from 'express';
import db from '../db.js';
import { getUserId } from './utils/index.js';
import { createTodo, listTodos, updateTodo } from '../services/todoService.js';
import { getApiErrorMessage, getApiErrorStatus } from '../services/errors.js';

const router = Router();

// 获取所有待办
router.get('/', (req, res) => {
  try {
    const userId = getUserId(req);
    return res.json(listTodos(userId));
  } catch (error) {
    console.error('获取待办列表错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '获取待办列表失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

// 创建待办
router.post('/', (req, res) => {
  try {
    return res.json(createTodo(getUserId(req), req.body));
  } catch (error) {
    console.error('创建待办错误:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '创建待办失败，请稍后重试') });
  }
});

// 更新待办
router.put('/:id/update', (req, res) => {
  try {
    return res.json(updateTodo(getUserId(req), req.params.id, req.body));
  } catch (error) {
    console.error('更新待办错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '更新待办失败，请稍后重试') });
  }
});

// 切换待办状态
router.put('/:id/toggle', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const todo = db.prepare('SELECT completed, orderId FROM todos WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (todo) {
      const newStatus = todo.completed ? 0 : 1;
      db.prepare('UPDATE todos SET completed = ? WHERE id = ? AND userId = ?').run(newStatus, id, userId);

      const updatedTodo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
      updatedTodo.completed = Boolean(updatedTodo.completed);
      return res.json(updatedTodo);
    } else {
      return res.status(404).json({ error: '未找到待办事项' });
    }
  } catch (error) {
    console.error('切换待办状态错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '切换待办状态失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

// 删除待办
router.delete('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const todo = db.prepare('SELECT id FROM todos WHERE id = ? AND userId = ?').get(id, userId);
    if (!todo) {
      return res.status(404).json({ error: '待办事项不存在' });
    }
    db.prepare('DELETE FROM todos WHERE id = ? AND userId = ?').run(id, userId);
    return res.json({ success: true });
  } catch (error) {
    console.error('删除待办错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '删除待办失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
