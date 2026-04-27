import { Router } from 'express';
import db from '../db.js';
import { getUserId } from './utils/index.js';

const router = Router();

// 获取操作日志
router.get('/', (req, res) => {
  const userId = getUserId(req);
  const logs = db.prepare('SELECT * FROM activity_logs WHERE userId = ? ORDER BY createdAt DESC LIMIT 100').all(userId);
  res.json(logs);
});

// 清空操作日志
router.delete('/', (req, res) => {
  const userId = getUserId(req);
  db.prepare('DELETE FROM activity_logs WHERE userId = ?').run(userId);
  res.json({ success: true });
});

export default router;