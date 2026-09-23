import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { isValidDateOnly } from '../routes/utils/helpers.js';
import { ApiError } from './errors.js';

export type TodoInput = {
  content?: unknown;
  priority?: unknown;
  category?: unknown;
  completed?: unknown;
  dueDate?: unknown;
  orderId?: unknown;
  brandId?: unknown;
};

type TodoRow = {
  id: string;
  userId: string;
  content: string;
  priority: string;
  category: string | null;
  completed: number;
  dueDate: string | null;
  orderId: string | null;
  brandId: string | null;
};

const normalizeContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError('待办内容不能为空');
  const content = value.trim();
  if (content.length > 500) throw new ApiError('待办内容不能超过500个字符');
  return content;
};

const normalizePriority = (value: unknown): 'low' | 'medium' | 'high' => {
  if (value !== 'low' && value !== 'medium' && value !== 'high') throw new ApiError('待办优先级无效');
  return value;
};

const normalizeOptionalText = (value: unknown, field: string, maxLength: number): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(`${field}格式无效`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ApiError(`${field}不能超过${maxLength}个字符`);
  return normalized || null;
};

const normalizeDate = (value: unknown): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (!isValidDateOnly(value)) throw new ApiError('待办日期无效');
  return value;
};

const ensureOwnedRelations = (userId: string, orderId: string | null, brandId: string | null) => {
  if (orderId && !db.prepare('SELECT 1 FROM orders WHERE id = ? AND userId = ?').get(orderId, userId)) {
    throw new ApiError('关联商单不存在', 404);
  }
  if (brandId && !db.prepare('SELECT 1 FROM brands WHERE id = ? AND userId = ?').get(brandId, userId)) {
    throw new ApiError('关联品牌不存在', 404);
  }
};

const parseTodo = (todo: TodoRow | undefined) => todo ? { ...todo, completed: Boolean(todo.completed) } : todo;

export const countTodos = (userId: string): number => (
  (db.prepare('SELECT COUNT(*) AS count FROM todos WHERE userId = ?').get(userId) as { count: number }).count
);

export const listTodos = (userId: string, paging?: { limit?: number; offset?: number }) => {
  const clause = paging?.limit ? ' LIMIT ? OFFSET ?' : '';
  const todos = db.prepare(`
    SELECT t.*, o.status AS orderStatus, o.orderNo AS orderNo
    FROM todos t
    LEFT JOIN orders o ON t.orderId = o.id AND o.userId = t.userId
    WHERE t.userId = ?
    ORDER BY t.createdAt DESC${clause}
  `).all(...(paging?.limit ? [userId, paging.limit, paging.offset ?? 0] : [userId])) as TodoRow[];
  return todos.map(todo => parseTodo(todo));
};

export const listUpcomingTodos = (userId: string, limit = 6) => {
  const todos = db.prepare(`
    SELECT t.*, o.status AS orderStatus, o.orderNo AS orderNo
    FROM todos t
    LEFT JOIN orders o ON t.orderId = o.id AND o.userId = t.userId
    WHERE t.userId = ? AND t.completed = 0
    ORDER BY CASE WHEN t.dueDate IS NULL OR t.dueDate = '' THEN 1 ELSE 0 END,
      t.dueDate ASC,
      CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      t.createdAt DESC
    LIMIT ?
  `).all(userId, limit) as TodoRow[];
  return todos.map(todo => parseTodo(todo));
};

export const createTodo = (userId: string, input: TodoInput) => {
  const content = normalizeContent(input.content);
  const priority = normalizePriority(input.priority ?? 'medium');
  const category = normalizeOptionalText(input.category, '待办分类', 50);
  const dueDate = normalizeDate(input.dueDate);
  const orderId = normalizeOptionalText(input.orderId, '关联商单', 100);
  const brandId = normalizeOptionalText(input.brandId, '关联品牌', 100);
  ensureOwnedRelations(userId, orderId, brandId);
  const id = uuidv4();

  db.prepare(`
    INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(id, userId, content, priority, category, dueDate, orderId, brandId);
  return parseTodo(db.prepare('SELECT * FROM todos WHERE id = ? AND userId = ?').get(id, userId) as TodoRow | undefined);
};

export const updateTodo = (userId: string, id: string, input: TodoInput) => {
  const existing = db.prepare('SELECT * FROM todos WHERE id = ? AND userId = ?').get(id, userId) as TodoRow | undefined;
  if (!existing) throw new ApiError('待办事项不存在', 404);

  const content = input.content !== undefined ? normalizeContent(input.content) : normalizeContent(existing.content);
  const priority = input.priority !== undefined ? normalizePriority(input.priority) : normalizePriority(existing.priority);
  const category = input.category !== undefined
    ? normalizeOptionalText(input.category, '待办分类', 50)
    : existing.category;
  const dueDate = input.dueDate !== undefined ? normalizeDate(input.dueDate) : existing.dueDate;
  const orderId = input.orderId !== undefined
    ? normalizeOptionalText(input.orderId, '关联商单', 100)
    : existing.orderId;
  const brandId = input.brandId !== undefined
    ? normalizeOptionalText(input.brandId, '关联品牌', 100)
    : existing.brandId;
  const completed = input.completed !== undefined ? (input.completed ? 1 : 0) : existing.completed;
  ensureOwnedRelations(userId, orderId, brandId);

  db.prepare(`
    UPDATE todos
    SET content = ?, priority = ?, category = ?, completed = ?, dueDate = ?, orderId = ?, brandId = ?
    WHERE id = ? AND userId = ?
  `).run(content, priority, category, completed, dueDate, orderId, brandId, id, userId);
  return parseTodo(db.prepare('SELECT * FROM todos WHERE id = ? AND userId = ?').get(id, userId) as TodoRow | undefined);
};
