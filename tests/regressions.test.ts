import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { parseLocalDate } from '../src/lib/dateFilter.ts';

const testDataDir = mkdtempSync(join(tmpdir(), 'kolflow-regressions-'));
process.env.DATA_DIR = testDataDir;
process.env.JWT_SECRET = 'kolflow-regression-test-secret';
process.env.NODE_ENV = 'test';

let db: typeof import('../src/server/db.ts').default;
let server: Server;
let baseUrl: string;
let token: string;
const primaryUserId = uuidv4();
const secondaryUserId = uuidv4();

const jsonHeaders = (authorization: string) => ({
  Authorization: authorization,
  'Content-Type': 'application/json',
});

const resetDatabase = () => {
  const tables = [
    'publish_links',
    'paid_promotions',
    'assets',
    'comments',
    'activity_logs',
    'todos',
    'payments',
    'orders',
    'brands',
    'settings',
    'users',
  ];

  db.pragma('foreign_keys = OFF');
  try {
    for (const table of tables) db.prepare(`DELETE FROM ${table}`).run();
  } finally {
    db.pragma('foreign_keys = ON');
  }

  const insertUser = db.prepare('INSERT INTO users (id, email, password, displayName) VALUES (?, ?, ?, ?)');
  insertUser.run(primaryUserId, 'primary@example.com', 'unused-hash', 'Primary');
  insertUser.run(secondaryUserId, 'secondary@example.com', 'unused-hash', 'Secondary');

  const insertSettings = db.prepare(`
    INSERT INTO settings (id, userId, displayName, email, apiKey)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertSettings.run(uuidv4(), primaryUserId, 'Primary', 'primary@example.com', 'primary-api-key');
  insertSettings.run(uuidv4(), secondaryUserId, 'Secondary', 'secondary@example.com', 'secondary-api-key');
};

const internalRequest = (path: string, init: RequestInit = {}) => fetch(`${baseUrl}/api${path}`, {
  ...init,
  headers: {
    ...jsonHeaders(`Bearer ${token}`),
    ...(init.headers || {}),
  },
});

const externalRequest = (path: string, init: RequestInit = {}) => fetch(`${baseUrl}/api/external${path}`, {
  ...init,
  headers: {
    ...jsonHeaders('Bearer primary-api-key'),
    ...(init.headers || {}),
  },
});

before(async () => {
  db = (await import('../src/server/db.ts')).default;
  const apiRoutes = (await import('../src/server/api.ts')).default;
  const { generateToken } = await import('../src/server/routes/utils/index.ts');
  token = generateToken(primaryUserId, 'primary@example.com');

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', apiRoutes);

  await new Promise<void>(resolve => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  resetDatabase();
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  db.close();
  rmSync(testDataDir, { recursive: true, force: true });
});

test('API Key 在多用户之间必须唯一', () => {
  db.prepare('UPDATE settings SET apiKey = ? WHERE userId = ?').run('shared-api-key', primaryUserId);
  assert.throws(() => {
    db.prepare('UPDATE settings SET apiKey = ? WHERE userId = ?').run('shared-api-key', secondaryUserId);
  });
});

test('品牌重命名同步关联记录并拒绝重名', async () => {
  const brandId = uuidv4();
  const duplicateBrandId = uuidv4();
  const orderId = uuidv4();
  db.prepare('INSERT INTO brands (id, userId, name) VALUES (?, ?, ?)').run(brandId, primaryUserId, '旧品牌');
  db.prepare('INSERT INTO brands (id, userId, name) VALUES (?, ?, ?)').run(duplicateBrandId, primaryUserId, '已有品牌');
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status, brandName)
    VALUES (?, ?, ?, ?, 'paid', 'completed', ?)
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '测试商单', '旧品牌');
  db.prepare('INSERT INTO payments (id, userId, brand, amount) VALUES (?, ?, ?, ?)').run(uuidv4(), primaryUserId, '旧品牌', 100);
  db.prepare(`
    INSERT INTO assets (id, userId, orderId, brandName, productName)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), primaryUserId, orderId, '旧品牌', '测试资产');
  db.prepare(`
    INSERT INTO todos (id, userId, content, category, brandId)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), primaryUserId, '测试待办', '旧品牌', brandId);

  const renameResponse = await internalRequest(`/brands/${brandId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: '新品牌' }),
  });
  assert.equal(renameResponse.status, 200);
  assert.equal((db.prepare('SELECT brandName FROM orders WHERE id = ?').get(orderId) as any).brandName, '新品牌');
  assert.equal((db.prepare('SELECT brand FROM payments WHERE userId = ?').get(primaryUserId) as any).brand, '新品牌');
  assert.equal((db.prepare('SELECT brandName FROM assets WHERE userId = ?').get(primaryUserId) as any).brandName, '新品牌');
  assert.equal((db.prepare('SELECT category FROM todos WHERE userId = ?').get(primaryUserId) as any).category, '新品牌');

  const duplicateResponse = await externalRequest(`/brands/${brandId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: '已有品牌' }),
  });
  assert.equal(duplicateResponse.status, 400);
});

test('内部和外部 API 对非法待办、账单和链接使用相同校验', async () => {
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '校验商单');

  for (const request of [internalRequest, externalRequest]) {
    const todoResponse = await request(request === internalRequest ? '/todos' : '/todos', {
      method: 'POST',
      body: JSON.stringify({ content: '   ', priority: 'invalid' }),
    });
    assert.equal(todoResponse.status, 400);

    const paymentResponse = await request('/payments', {
      method: 'POST',
      body: JSON.stringify({ brand: '测试品牌', amount: -1, type: 'invalid' }),
    });
    assert.equal(paymentResponse.status, 400);

    const linkResponse = await request(request === internalRequest ? '/publish-links' : '/publish-links', {
      method: 'POST',
      body: JSON.stringify({ orderId, platform: '其他', url: 'javascript:alert(1)' }),
    });
    assert.equal(linkResponse.status, 400);
  }
});

test('导入完成后前端状态立即刷新', async () => {
  const nativeFetch = globalThis.fetch;
  const storage = new Map<string, string>([['token', token]]);
  const localStorageMock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => { storage.clear(); },
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() { return storage.size; },
  } satisfies Storage;

  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: new URL(baseUrl) } });
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    return nativeFetch(new URL(rawUrl, baseUrl), init);
  };

  try {
    const { useStore } = await import('../src/store/useStore.ts');
    useStore.setState({ orders: [{ id: 'old', title: '旧数据' } as any] });

    await useStore.getState().setAllData({
      orders: [{ title: '导入后的商单', type: 'paid', status: 'in_progress', actualAmount: 0 }],
      brands: [],
      payments: [],
      todos: [],
      assets: [],
      publishLinks: [],
      paidPromotions: [],
      comments: [],
    });

    assert.equal(useStore.getState().orders.some(order => order.title === '导入后的商单'), true);
  } finally {
    globalThis.fetch = nativeFetch;
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('资产出售和商单派生账单使用客户端本地日期', async () => {
  const assetResponse = await internalRequest('/assets', {
    method: 'POST',
    body: JSON.stringify({
      productName: '测试资产',
      productValue: 100,
      saleStatus: 'sold',
      soldAmount: 80,
      operationDate: '2030-01-02',
    }),
  });
  assert.equal(assetResponse.status, 200);
  assert.equal((await assetResponse.json()).soldDate, '2030-01-02');

  const orderResponse = await internalRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({
      title: '已完成商单',
      type: 'paid',
      status: 'completed',
      actualAmount: 100,
      operationDate: '2030-01-02',
    }),
  });
  assert.equal(orderResponse.status, 200);
  const payment = db.prepare('SELECT date FROM payments WHERE userId = ? ORDER BY createdAt DESC LIMIT 1').get(primaryUserId) as any;
  assert.equal(payment.date, '2030-01-02');
});

test('纯日期按本地日历日期解析', () => {
  const parsed = parseLocalDate('2030-01-02');
  assert.ok(parsed);
  assert.equal(parsed.getFullYear(), 2030);
  assert.equal(parsed.getMonth(), 0);
  assert.equal(parsed.getDate(), 2);
  assert.equal(parsed.getHours(), 0);
});

test('账单分别保留截止日期和结算日期', async () => {
  const createResponse = await internalRequest('/payments', {
    method: 'POST',
    body: JSON.stringify({
      brand: '日期测试品牌',
      amount: 100,
      type: 'pending',
      dueDate: '2030-02-03',
    }),
  });
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json() as any;
  assert.equal(created.dueDate, '2030-02-03');
  assert.equal(created.settledDate, null);

  const settleResponse = await internalRequest(`/payments/${created.id}/settle`, {
    method: 'PUT',
    body: JSON.stringify({ settledDate: '2030-02-10' }),
  });
  assert.equal(settleResponse.status, 200);
  const settled = await settleResponse.json() as any;
  assert.equal(settled.dueDate, '2030-02-03');
  assert.equal(settled.settledDate, '2030-02-10');
});

test('通知设置控制到期提醒并生成周期报告通知', async () => {
  const { buildBusinessNotifications } = await import('../src/lib/notifications.ts');
  const order = {
    id: 'order-1',
    title: '待交稿商单',
    status: 'in_progress',
    submitDate: '2030-01-03',
  } as any;

  const disabled = buildBusinessNotifications({
    now: new Date(2030, 0, 1, 12),
    orders: [order],
    payments: [],
    settings: { id: 'settings-1', orderReminder: false, weeklyReport: false, reportFrequency: 'weekly' } as any,
    dismissedIds: [],
  });
  assert.equal(disabled.length, 0);

  const enabled = buildBusinessNotifications({
    now: new Date(2030, 0, 1, 12),
    orders: [order],
    payments: [],
    settings: { id: 'settings-1', orderReminder: true, weeklyReport: true, reportFrequency: 'weekly' } as any,
    dismissedIds: [],
    reportSummary: { totalOrders: 2, completedOrders: 1, totalIncome: 300, pendingIncome: 100 },
  });
  assert.equal(enabled.some(notification => notification.id.startsWith('order-warning-')), true);
  assert.equal(enabled.some(notification => notification.id.includes('report-weekly-')), true);
});

test('WebDAV 自动同步按配置周期判断是否到期', async () => {
  const { getWebdavStorageKey, isWebdavUploadDue } = await import('../src/lib/webdav.ts');
  const now = new Date('2030-01-02T02:00:00.000Z');
  assert.equal(isWebdavUploadDue('2030-01-02T00:30:00.000Z', 1, now), true);
  assert.equal(isWebdavUploadDue('2030-01-02T01:30:00.000Z', 1, now), false);
  assert.equal(isWebdavUploadDue(null, 24, now), true);
  assert.notEqual(getWebdavStorageKey('webdavConfig', 'user-a'), getWebdavStorageKey('webdavConfig', 'user-b'));
});

test('导入预检识别跨账号主键冲突并在导入时重新映射', async () => {
  const sharedBrandId = uuidv4();
  const sharedOrderId = uuidv4();
  const sharedOrderNo = `ORD-${uuidv4()}`;
  db.prepare('INSERT INTO brands (id, userId, name) VALUES (?, ?, ?)')
    .run(sharedBrandId, secondaryUserId, '另一账号品牌');
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(sharedOrderId, secondaryUserId, sharedOrderNo, '另一账号商单');

  const backup = {
    backupVersion: 2,
    brands: [{ id: sharedBrandId, name: '导入品牌' }],
    orders: [{ id: sharedOrderId, orderNo: sharedOrderNo, title: '导入商单', type: 'paid', status: 'in_progress' }],
    payments: [],
    todos: [],
    assets: [],
    publishLinks: [],
    paidPromotions: [],
    comments: [],
  };

  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify(backup),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json() as any;
  assert.equal(preview.conflicts.ids >= 2, true);
  assert.equal(preview.conflicts.orderNos >= 1, true);

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(backup),
  });
  assert.equal(importResponse.status, 200);

  const importedBrand = db.prepare('SELECT id FROM brands WHERE userId = ? AND name = ?')
    .get(primaryUserId, '导入品牌') as any;
  const importedOrder = db.prepare('SELECT id, orderNo FROM orders WHERE userId = ? AND title = ?')
    .get(primaryUserId, '导入商单') as any;
  assert.notEqual(importedBrand.id, sharedBrandId);
  assert.notEqual(importedOrder.id, sharedOrderId);
  assert.notEqual(importedOrder.orderNo, sharedOrderNo);
  assert.ok(db.prepare('SELECT 1 FROM orders WHERE id = ? AND userId = ?').get(sharedOrderId, secondaryUserId));
});

test('普通资料更新不会让展示邮箱与登录邮箱失去同步', async () => {
  const response = await internalRequest('/settings', {
    method: 'PUT',
    body: JSON.stringify({
      displayName: '更新后的用户',
      email: 'different@example.com',
      bio: '',
      orderReminder: true,
      weeklyReport: true,
      reportFrequency: 'monthly',
    }),
  });
  assert.equal(response.status, 200);
  const settings = await response.json() as any;
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(primaryUserId) as any;
  assert.equal(settings.email, user.email);
  assert.equal(settings.email, 'primary@example.com');
  assert.equal(settings.reportFrequency, 'monthly');
});
