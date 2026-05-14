import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logActivity, getUserId } from './utils/index.js';

const router = Router();

// 获取评论
router.get('/:orderId', (req, res) => {
  const userId = getUserId(req);
  const { orderId } = req.params;
  const comments = db.prepare('SELECT * FROM comments WHERE orderId = ? AND userId = ? ORDER BY createdAt DESC').all(orderId, userId);
  res.json(comments);
});

// 创建评论
router.post('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderId, content } = req.body;

    if (!orderId || !content || content.trim().length === 0) {
      return res.status(400).json({ error: '评论内容不能为空' });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO comments (id, userId, orderId, content)
      VALUES (?, ?, ?, ?)
    `).run(id, userId, orderId, content.trim());

    logActivity(userId, 'comment', 'order', orderId, `添加评论: ${content.substring(0, 50)}...`);

    const newComment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    return res.json(newComment);
  } catch (error) {
    console.error('创建评论错误:', error);
    return res.status(500).json({ error: '创建评论失败，请稍后重试' });
  }
});

// 删除评论
router.delete('/:id', (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;

  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND userId = ?').get(id, userId) as any;
  if (comment) {
    logActivity(userId, 'delete', 'comment', id, `删除评论: ${comment.content.substring(0, 30)}...`);
  }

  db.prepare('DELETE FROM comments WHERE id = ? AND userId = ?').run(id, userId);
  res.json({ success: true });
});

export default router;