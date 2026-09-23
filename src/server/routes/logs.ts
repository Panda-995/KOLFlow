import { Router } from 'express';
import db from '../db.js';
import { getUserId } from './utils/index.js';
import type { CountRow } from '../dbRows.js';

const router = Router();

const DEFAULT_LOGS_LIMIT = 100;
const MAX_LOGS_LIMIT = 500;

// 获取操作日志（支持分页：?limit=&offset=，默认取最近 100 条）。
// 通过 X-Total-Count 响应头返回总数，供客户端判断是否还有下一页。
router.get('/', (req, res) => {
  const userId = getUserId(req);
  const requestedLimit = Number(req.query.limit);
  const requestedOffset = Number(req.query.offset);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_LOGS_LIMIT)
    : DEFAULT_LOGS_LIMIT;
  const offset = Number.isInteger(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;

  const total = (db.prepare('SELECT COUNT(*) AS count FROM activity_logs WHERE userId = ?').get(userId) as CountRow).count;
  const logs = db.prepare('SELECT * FROM activity_logs WHERE userId = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?')
    .all(userId, limit, offset);

  res.setHeader('X-Total-Count', String(total));
  res.json(logs);
});

// 清空操作日志
router.delete('/', (req, res) => {
  const userId = getUserId(req);
  db.prepare('DELETE FROM activity_logs WHERE userId = ?').run(userId);
  res.json({ success: true });
});

export default router;
