import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express, { type ErrorRequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { normalizeServerUrl } from '../src/lib/api.ts';
import { parseLocalDate } from '../src/lib/dateFilter.ts';
import { csvCell } from '../src/lib/csv.ts';

// node 环境没有浏览器全局：为 WebDAV 等浏览器侧模块提供最小实现。
// 注意：不能只在模块作用域安装一次——其它用例的清理会删除这些全局属性，
// 因此需要时由用例自行安装，并在 finally 中清理。
const installBrowserStubs = (): void => {
  const memory = new Map<string, string>();
  const localStorageStub = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, String(value)); },
    removeItem: (key: string) => { memory.delete(key); },
    clear: () => { memory.clear(); },
    key: (index: number) => Array.from(memory.keys())[index] ?? null,
    get length() { return memory.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageStub });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: localStorageStub,
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
      location: new URL('https://localhost/'),
    },
  });
};

const removeBrowserStubs = (): void => {
  Reflect.deleteProperty(globalThis, 'localStorage');
  Reflect.deleteProperty(globalThis, 'window');
};
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
    'order_templates',
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

test('外部 API 拒绝 URL 中的 API Key，仅接受 Bearer 请求头', async () => {
  const exposed = await fetch(`${baseUrl}/api/external/orders?token=primary-api-key`);
  assert.equal(exposed.status, 401);
  assert.equal((await externalRequest('/orders')).status, 200);
});

test('大量商单列表使用压缩传输且内容完整', async () => {
  const insert = db.prepare('INSERT INTO orders (id, userId, orderNo, title, type, status) VALUES (?, ?, ?, ?, ?, ?)');
  for (let index = 0; index < 80; index++) {
    insert.run(uuidv4(), primaryUserId, `COMP-${index}`, `压缩传输验证商单 ${index}`, 'paid', 'in_progress');
  }
  const response = await fetch(`${baseUrl}/api/orders`, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Encoding': 'gzip' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-encoding'), 'gzip');
  assert.equal((await response.json() as unknown[]).length, 80);
});

test('升级解析依赖后 CSV 上传保留中文、引号、金额和日期', async () => {
  const form = new FormData();
  form.append('file', new Blob(['\uFEFF标题,类型,金额,品牌,接单日期,状态\n"带,逗号的商单",付费,321.5,测试品牌,2026-09-14,已完成\n'], { type: 'text/csv' }), 'orders.csv');
  const response = await fetch(`${baseUrl}/api/data/orders/file`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  assert.equal(response.status, 200);
  const result = await response.json() as any;
  assert.equal(result.success, 1);
  assert.equal(result.failed, 0);
  const order = db.prepare('SELECT * FROM orders WHERE userId = ?').get(primaryUserId) as any;
  assert.equal(order.title, '带,逗号的商单');
  assert.equal(order.actualAmount, 321.5);
  assert.equal(order.acceptDate, '2026-09-14');
});

test('商单模板按用户隔离并可重复一键创建全新商单', async () => {
  const createTemplateResponse = await internalRequest('/order-templates', {
    method: 'POST',
    body: JSON.stringify({
      name: '日常小红书合作',
      title: '新品种草',
      type: 'paid',
      actualAmount: 2800,
      brandName: '模板品牌',
      platforms: ['小红书'],
    }),
  });
  assert.equal(createTemplateResponse.status, 200);
  const template = await createTemplateResponse.json() as any;
  assert.deepEqual(template.platforms, ['小红书']);

  db.prepare(`
    INSERT INTO order_templates (id, userId, name, title, type, actualAmount, platforms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), secondaryUserId, '其他账号模板', '不应可见', 'paid', 1, '[]');

  const listResponse = await internalRequest('/order-templates');
  assert.equal(listResponse.status, 200);
  const templates = await listResponse.json() as any[];
  assert.deepEqual(templates.map(item => item.id), [template.id]);

  const firstCreateResponse = await internalRequest(`/order-templates/${template.id}/create-order`, {
    method: 'POST',
    body: JSON.stringify({ operationDate: '2030-05-06' }),
  });
  const secondCreateResponse = await internalRequest(`/order-templates/${template.id}/create-order`, {
    method: 'POST',
    body: JSON.stringify({ operationDate: '2030-05-06' }),
  });
  assert.equal(firstCreateResponse.status, 200);
  assert.equal(secondCreateResponse.status, 200);
  const firstOrder = await firstCreateResponse.json() as any;
  const secondOrder = await secondCreateResponse.json() as any;
  assert.notEqual(firstOrder.id, secondOrder.id);
  assert.notEqual(firstOrder.orderNo, secondOrder.orderNo);
  assert.equal(firstOrder.status, 'in_progress');
  assert.equal(firstOrder.acceptDate, '2030-05-06');
  assert.equal(firstOrder.submitDate, null);
  assert.equal(firstOrder.actualAmount, 2800);
  assert.deepEqual(firstOrder.platforms, ['小红书']);
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM todos WHERE userId = ? AND orderId IN (?, ?)')
      .get(primaryUserId, firstOrder.id, secondOrder.id) as any).count,
    2,
  );
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM comments WHERE orderId IN (?, ?)')
      .get(firstOrder.id, secondOrder.id) as any).count,
    0,
  );

  const updateResponse = await internalRequest(`/order-templates/${template.id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: '更新后的模板', actualAmount: 3200 }),
  });
  assert.equal(updateResponse.status, 200);
  const updatedTemplate = await updateResponse.json() as any;
  assert.equal(updatedTemplate.name, '更新后的模板');
  assert.equal(updatedTemplate.title, '新品种草');
  assert.equal(updatedTemplate.actualAmount, 3200);

  const deleteResponse = await internalRequest(`/order-templates/${template.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
  assert.equal(db.prepare('SELECT 1 FROM order_templates WHERE id = ?').get(template.id), undefined);
});

test('备份 v4 导出商单模板且仍可导入 v2 和 v3 旧数据', async () => {
  const createTemplateResponse = await internalRequest('/order-templates', {
    method: 'POST',
    body: JSON.stringify({
      name: '备份模板',
      title: '备份商单',
      type: 'direct',
      actualAmount: 600,
      platforms: ['抖音'],
    }),
  });
  assert.equal(createTemplateResponse.status, 200);

  const exportResponse = await internalRequest('/data/export');
  assert.equal(exportResponse.status, 200);
  const exported = await exportResponse.json() as any;
  assert.equal(exported.backupVersion, 4);
  assert.equal(exported.orderTemplates.length, 1);
  assert.deepEqual(exported.orderTemplates[0].platforms, ['抖音']);

  const legacyImportResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 2,
      orders: [{ id: uuidv4(), title: '旧版商单', type: 'paid', status: 'in_progress', actualAmount: 100 }],
      brands: [],
      payments: [],
      todos: [],
      assets: [],
      publishLinks: [],
      paidPromotions: [],
      comments: [],
    }),
  });
  assert.equal(legacyImportResponse.status, 200);
  // 新语义：备份中缺失的集合不再被当作空集合清空，模板应被保留
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM order_templates WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '旧版备份未包含商单模板集合时，现有模板必须保留',
  );

  for (const version of [3, 4]) {
    const restoreResponse = await internalRequest('/data/import', {
      method: 'POST',
      body: JSON.stringify({ ...exported, backupVersion: version }),
    });
    assert.equal(restoreResponse.status, 200, `v${version} backup should restore successfully`);
    const restoredTemplate = db.prepare('SELECT platforms FROM order_templates WHERE userId = ?').get(primaryUserId) as any;
    assert.deepEqual(JSON.parse(restoredTemplate.platforms), ['抖音']);
  }
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

test('生产服务默认保留 HTTP 功能并允许按需启用 HTTPS 强制策略', async () => {
  const {
    getHttpsEnforcementPolicy,
    resolveTrustProxy,
  } = await import('../src/server/transportSecurity.ts');

  assert.equal(getHttpsEnforcementPolicy({ NODE_ENV: 'production' }), false);
  assert.equal(getHttpsEnforcementPolicy({ NODE_ENV: 'production', ENFORCE_HTTPS: 'true' }), true);
  assert.equal(getHttpsEnforcementPolicy({ NODE_ENV: 'production', ENFORCE_HTTPS: 'false' }), false);
  assert.equal(getHttpsEnforcementPolicy({ NODE_ENV: 'development' }), false);
  assert.equal(resolveTrustProxy(undefined), false);
  assert.equal(resolveTrustProxy('false'), false);
  assert.equal(resolveTrustProxy('1'), 1);
});

test('Android 服务地址省略协议时默认使用 HTTP', () => {
  assert.equal(normalizeServerUrl('192.168.1.20:3000'), 'http://192.168.1.20:3000');
  assert.equal(normalizeServerUrl('http://nas.local:3000'), 'http://nas.local:3000');
  assert.equal(normalizeServerUrl('https://kolflow.example.com'), 'https://kolflow.example.com');
});

test('HTTP 认证请求体不包含邮箱、密码和邀请码明文且密文不可重放', async () => {
  const {
    encryptSensitivePayload,
  } = await import('../src/lib/authEncryption.ts');
  const {
    decryptSensitivePayload,
    issueAuthEncryptionKey,
  } = await import('../src/server/services/authEncryptionService.ts');

  const sensitiveData = {
    email: 'encrypted-user@example.com',
    password: 'Secret123!',
    inviteCode: 'panda995',
    privacyAccepted: true,
  };
  const key = issueAuthEncryptionKey();
  const encryptedAuth = await encryptSensitivePayload(key, sensitiveData);
  const wireBody = JSON.stringify({ encryptedAuth });

  assert.equal(wireBody.includes(sensitiveData.email), false);
  assert.equal(wireBody.includes(sensitiveData.password), false);
  assert.equal(wireBody.includes(sensitiveData.inviteCode), false);
  assert.deepEqual(decryptSensitivePayload(encryptedAuth), sensitiveData);
  assert.throws(() => decryptSensitivePayload(encryptedAuth), /已使用|过期/);
});

test('HTTP 下可以使用密文完成注册、登录、安全设置和账号注销', async () => {
  const { encryptSensitivePayload } = await import('../src/lib/authEncryption.ts');

  const registerKeyResponse = await fetch(`${baseUrl}/api/auth/encryption-key`);
  assert.equal(registerKeyResponse.status, 200);
  const registerKey = await registerKeyResponse.json() as any;
  const registerPayload = {
    email: 'http-user@example.com',
    password: 'Secret123!',
    inviteCode: 'panda995',
    privacyAccepted: true,
  };
  const encryptedRegistration = await encryptSensitivePayload(registerKey, registerPayload);
  const registerWireBody = JSON.stringify({ encryptedAuth: encryptedRegistration });
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: registerWireBody,
  });
  assert.equal(registerResponse.status, 200);
  assert.equal(registerWireBody.includes(registerPayload.email), false);
  assert.equal(registerWireBody.includes(registerPayload.password), false);
  assert.equal(registerWireBody.includes(registerPayload.inviteCode), false);

  const loginKey = await (await fetch(`${baseUrl}/api/auth/encryption-key`)).json() as any;
  const loginPayload = {
    email: registerPayload.email,
    password: registerPayload.password,
    privacyAccepted: true,
  };
  const encryptedLogin = await encryptSensitivePayload(loginKey, loginPayload);
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encryptedAuth: encryptedLogin }),
  });
  assert.equal(loginResponse.status, 200);
  const loginData = await loginResponse.json() as any;
  assert.equal(loginData.email, undefined);
  assert.equal(
    Buffer.from(loginData.token.split('.')[1], 'base64url').toString('utf8').includes(registerPayload.email),
    false,
  );

  const securityKey = await (await fetch(`${baseUrl}/api/auth/encryption-key`)).json() as any;
  const securityPayload = {
    email: 'http-user-renamed@example.com',
    oldPassword: registerPayload.password,
    password: 'NewSecret123!',
  };
  const encryptedSecurity = await encryptSensitivePayload(securityKey, securityPayload);
  const securityWireBody = JSON.stringify({ encryptedAuth: encryptedSecurity });
  const securityResponse = await fetch(`${baseUrl}/api/settings/security`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${loginData.token}`,
      'Content-Type': 'application/json',
    },
    body: securityWireBody,
  });
  assert.equal(securityResponse.status, 200);
  assert.equal(securityWireBody.includes(securityPayload.email), false);
  assert.equal(securityWireBody.includes(securityPayload.oldPassword), false);
  assert.equal(securityWireBody.includes(securityPayload.password), false);

  // 修改密码后，旧 token 必须立即失效（会话撤销）
  const oldTokenResponse = await fetch(`${baseUrl}/api/orders`, {
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  assert.equal(oldTokenResponse.status, 401);

  // 使用新密码与新邮箱重新登录，拿到的 token 才能继续操作
  const reloginKey = await (await fetch(`${baseUrl}/api/auth/encryption-key`)).json() as any;
  const reloginPayload = {
    email: securityPayload.email,
    password: securityPayload.password,
    privacyAccepted: true,
  };
  const encryptedRelogin = await encryptSensitivePayload(reloginKey, reloginPayload);
  const reloginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encryptedAuth: encryptedRelogin }),
  });
  assert.equal(reloginResponse.status, 200);
  const reloginData = await reloginResponse.json() as any;

  const deletionKey = await (await fetch(`${baseUrl}/api/auth/encryption-key`)).json() as any;
  const encryptedDeletion = await encryptSensitivePayload(deletionKey, { password: securityPayload.password });
  const deletionWireBody = JSON.stringify({ encryptedAuth: encryptedDeletion });
  const deletionResponse = await fetch(`${baseUrl}/api/settings/account`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${reloginData.token}`,
      'Content-Type': 'application/json',
    },
    body: deletionWireBody,
  });
  assert.equal(deletionResponse.status, 200);
  assert.equal(deletionWireBody.includes(securityPayload.password), false);

  const plaintextResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginPayload),
  });
  assert.equal(plaintextResponse.status, 400);
  assert.match((await plaintextResponse.json() as any).error, /加密/);
});

test('完整数据导入允许 100 MB JSON 且普通接口仍限制为 10 MB', async () => {
  const {
    configureJsonBodyParsers,
    DEFAULT_JSON_BODY_LIMIT,
    IMPORT_JSON_BODY_LIMIT,
    getPayloadTooLargeMessage,
  } = await import('../src/server/requestBodyLimits.ts');

  assert.equal(DEFAULT_JSON_BODY_LIMIT, '10mb');
  assert.equal(IMPORT_JSON_BODY_LIMIT, '100mb');

  const limitApp = express();
  configureJsonBodyParsers(limitApp);
  limitApp.post('/api/data/import/preview', (req, res) => {
    res.json({ imageLength: req.body.assets[0].image.length });
  });
  limitApp.post('/api/ordinary', (_req, res) => {
    res.json({ success: true });
  });
  const payloadErrorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    const status = error.status || 500;
    res.status(status).json({
      error: status === 413 ? getPayloadTooLargeMessage(req.originalUrl) : error.message,
    });
  };
  limitApp.use(payloadErrorHandler);

  const limitServer = await new Promise<Server>(resolve => {
    const nextServer = limitApp.listen(0, '127.0.0.1', () => resolve(nextServer));
  });
  const address = limitServer.address() as AddressInfo;
  const limitBaseUrl = `http://127.0.0.1:${address.port}`;
  const largeImage = 'x'.repeat(11 * 1024 * 1024);
  const body = JSON.stringify({ assets: [{ image: largeImage }] });

  try {
    const importResponse = await fetch(`${limitBaseUrl}/api/data/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(importResponse.status, 200);
    assert.equal((await importResponse.json() as any).imageLength, largeImage.length);

    const ordinaryResponse = await fetch(`${limitBaseUrl}/api/ordinary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    assert.equal(ordinaryResponse.status, 413);
    assert.equal((await ordinaryResponse.json() as any).error, '请求实体超过 10 MB 上限');
  } finally {
    await new Promise<void>((resolve, reject) => {
      limitServer.close(error => error ? reject(error) : resolve());
    });
  }
});


test('空备份对象无法通过预检，也不会清空现有数据', async () => {
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '备份保护商单');

  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert.equal(previewResponse.status, 400);

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  assert.equal(importResponse.status, 400);

  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM orders WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '拒绝导入后原有商单必须原样保留',
  );
});

test('商单状态回退保留已结算账单，仅移除未结算账单', async () => {
  const createResponse = await internalRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({ title: '回退商单', type: 'paid', status: 'completed', actualAmount: 1000 }),
  });
  assert.equal(createResponse.status, 200);
  const order = await createResponse.json() as any;

  const paymentsList = await (await internalRequest('/payments')).json() as any[];
  const payment = paymentsList.find(p => p.orderNo === order.orderNo);
  assert.ok(payment, '完成商单应自动生成账单');

  const settleResponse = await internalRequest(`/payments/${payment.id}/settle`, {
    method: 'PUT',
    body: JSON.stringify({ settled: true }),
  });
  assert.equal(settleResponse.status, 200);

  const rollbackResponse = await internalRequest(`/orders/${order.id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'in_progress' }),
  });
  assert.equal(rollbackResponse.status, 200);

  const paymentsAfter = await (await internalRequest('/payments')).json() as any[];
  const kept = paymentsAfter.find(p => p.id === payment.id);
  assert.ok(kept, '已结算账单不能被状态回退删除');
  assert.equal(kept.type, 'settled');
});

test('商单状态回退保留已出售资产，仅移除未出售资产', async () => {
  const createResponse = await internalRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({ title: '回退置换商单', type: 'product_exchange', status: 'completed', productValue: 300 }),
  });
  assert.equal(createResponse.status, 200);
  const order = await createResponse.json() as any;

  const assetsList = await (await internalRequest('/assets')).json() as any[];
  const asset = assetsList.find(a => a.orderId === order.id);
  assert.ok(asset, '完成置换商单应自动生成资产');

  const sellResponse = await internalRequest(`/assets/${asset.id}`, {
    method: 'PUT',
    body: JSON.stringify({ saleStatus: 'sold', soldAmount: 260, soldDate: '2026-09-01' }),
  });
  assert.equal(sellResponse.status, 200);

  const rollbackResponse = await internalRequest(`/orders/${order.id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'in_progress' }),
  });
  assert.equal(rollbackResponse.status, 200);

  const assetsAfter = await (await internalRequest('/assets')).json() as any[];
  assert.ok(assetsAfter.some(a => a.id === asset.id && a.saleStatus === 'sold'), '已出售资产不能被状态回退删除');
});

test('完整备份原样恢复，不覆盖独立修改的账单金额', async () => {
  const createResponse = await internalRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({ title: '恢复商单', type: 'paid', status: 'completed', actualAmount: 1000, brandName: '恢复品牌' }),
  });
  assert.equal(createResponse.status, 200);
  const order = await createResponse.json() as any;

  const paymentsList = await (await internalRequest('/payments')).json() as any[];
  const payment = paymentsList.find(p => p.orderNo === order.orderNo);
  assert.ok(payment);

  const editResponse = await internalRequest(`/payments/${payment.id}`, {
    method: 'PUT',
    body: JSON.stringify({ amount: 800 }),
  });
  assert.equal(editResponse.status, 200);

  const exportResponse = await internalRequest('/data/export');
  assert.equal(exportResponse.status, 200);
  const backup = await exportResponse.json() as any;
  assert.ok(Array.isArray(backup.activityLogs), '完整备份必须包含操作日志');

  const restoreResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(backup),
  });
  assert.equal(restoreResponse.status, 200);

  const paymentsAfter = await (await internalRequest('/payments')).json() as any[];
  const restored = paymentsAfter.find(p => p.orderNo === order.orderNo);
  assert.ok(restored);
  assert.equal(restored.amount, 800, '恢复后账单金额必须保持独立修改值');
});

test('商单接口拒绝非法类型、状态、平台与日期', async () => {
  const cases = [
    { title: '非法平台', platforms: { name: '抖音' } },
    { title: '非法状态', status: 'weird-status' },
    { title: '非法日期', acceptDate: 'not-a-date' },
    { title: '非法类型', type: 'free' },
  ];
  for (const body of cases) {
    const response = await internalRequest('/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400, `应拒绝非法输入: ${JSON.stringify(body)}`);
  }

  const listResponse = await internalRequest('/orders');
  const orders = await listResponse.json() as any[];
  assert.equal(orders.length, 0, '被拒绝的非法数据不能入库');
});

test('重复结算不会反向撤销账单状态', async () => {
  const createResponse = await internalRequest('/payments', {
    method: 'POST',
    body: JSON.stringify({ brand: '幂等品牌', amount: 120 }),
  });
  assert.equal(createResponse.status, 200);
  const payment = await createResponse.json() as any;

  const firstSettle = await internalRequest(`/payments/${payment.id}/settle`, {
    method: 'PUT',
    body: JSON.stringify({ settled: true, settledDate: '2026-09-01' }),
  });
  assert.equal(firstSettle.status, 200);
  const settledOnce = await firstSettle.json() as any;
  assert.equal(settledOnce.type, 'settled');
  assert.equal(settledOnce.settledDate, '2026-09-01');

  // 重复同一结算请求（如网络重试）不能把状态切回待结算
  const secondSettle = await internalRequest(`/payments/${payment.id}/settle`, {
    method: 'PUT',
    body: JSON.stringify({ settled: true }),
  });
  assert.equal(secondSettle.status, 200);
  const settledTwice = await secondSettle.json() as any;
  assert.equal(settledTwice.type, 'settled');
  assert.equal(settledTwice.settledDate, '2026-09-01', '重复结算不应改写原结算日期');
});

test('评论必须关联当前用户已有的商单', async () => {
  const missingResponse = await internalRequest('/comments', {
    method: 'POST',
    body: JSON.stringify({ orderId: 'not-exist-order', content: '评论' }),
  });
  assert.equal(missingResponse.status, 404);

  const otherOrderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(otherOrderId, secondaryUserId, `ORD-${uuidv4()}`, '他人商单');

  const foreignResponse = await internalRequest('/comments', {
    method: 'POST',
    body: JSON.stringify({ orderId: otherOrderId, content: '评论' }),
  });
  assert.equal(foreignResponse.status, 404, '不能给其他用户的商单添加评论');

  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM comments WHERE userId = ?').get(primaryUserId) as any).count,
    0,
  );
});

test('密码校验拒绝超过 72 字节的密码', async () => {
  const { validatePassword } = await import('../src/server/routes/utils/helpers.ts');

  assert.equal(validatePassword('abc123').valid, true);
  assert.equal(validatePassword('a1'.repeat(36)).valid, true, '恰好 72 字节应被接受');

  const asciiTooLong = validatePassword('a1'.repeat(40));
  assert.equal(asciiTooLong.valid, false, '超过 72 字节的 ASCII 密码应被拒绝');

  const unicodeTooLong = validatePassword('密码a1'.repeat(20));
  assert.equal(unicodeTooLong.valid, false, '中文字符按 3 字节计入总长');
});


test('settings 为 null 的伪备份被拒绝且不清空数据', async () => {
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '伪备份保护商单');

  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify({ settings: null }),
  });
  assert.equal(previewResponse.status, 400, 'settings:null 不能通过预检');

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({ settings: null }),
  });
  assert.equal(importResponse.status, 400, 'settings:null 不能触发导入');

  // 只有空数组集合、没有任何记录的备份同样必须被拒绝
  const emptyCollectionsResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, orders: [], brands: [], payments: [], todos: [], assets: [] }),
  });
  assert.equal(emptyCollectionsResponse.status, 400, '空记录备份必须被拒绝');

  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM orders WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '伪备份不得清空现有商单',
  );
});

test('完整恢复原样保留商单待办的完成状态与 ID', async () => {
  const createResponse = await internalRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({ title: '待办保真商单', type: 'paid', status: 'in_progress', actualAmount: 500, brandName: '待办保真品牌' }),
  });
  assert.equal(createResponse.status, 200);
  const order = await createResponse.json() as any;

  const todosResponse = await internalRequest('/todos');
  const todos = await todosResponse.json() as any[];
  const generatedTodo = todos.find(t => t.orderId === order.id);
  assert.ok(generatedTodo, '创建商单应生成商单待办');
  assert.equal(generatedTodo.completed, false);

  // 用户手动完成该待办
  const toggleResponse = await internalRequest(`/todos/${generatedTodo.id}/toggle`, { method: 'PUT' });
  assert.equal(toggleResponse.status, 200);

  const exportResponse = await internalRequest('/data/export');
  const backup = await exportResponse.json() as any;

  const restoreResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(backup),
  });
  assert.equal(restoreResponse.status, 200);

  const todosAfter = await (await internalRequest('/todos')).json() as any[];
  const restoredTodo = todosAfter.find(t => t.content === `商单任务: 待办保真商单`);
  assert.ok(restoredTodo, '恢复后商单待办必须存在');
  assert.equal(restoredTodo.id, generatedTodo.id, '待办 ID 必须原样保留');
  assert.equal(Boolean(restoredTodo.completed), true, '用户手动勾选的完成状态必须保留');
});

test('备份导入对非法商单数据做消毒而不是原样入库', async () => {
  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 4,
      orders: [{
        id: uuidv4(),
        title: '消毒商单',
        type: 'weird-type',
        status: 'weird-status',
        actualAmount: -500,
        acceptDate: 'not-a-date',
        platforms: ['抖音'],
      }],
      brands: [],
      payments: [],
      todos: [],
      assets: [],
    }),
  });
  assert.equal(importResponse.status, 200);

  const listResponse = await internalRequest('/orders');
  const orders = await listResponse.json() as any[];
  const sanitized = orders.find(o => o.title === '消毒商单');
  assert.ok(sanitized);
  assert.equal(sanitized.type, 'paid', '非法类型必须回退为付费');
  assert.equal(sanitized.status, 'in_progress', '非法状态必须回退为进行中');
  assert.equal(sanitized.actualAmount, 0, '负金额必须归零');
  assert.equal(sanitized.acceptDate, null, '非法日期必须置空');
});

test('商单金额非法输入返回 400 且不清零原金额', async () => {
  const createResponse = await internalRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({ title: '金额校验商单', type: 'paid', status: 'in_progress', actualAmount: 1000 }),
  });
  assert.equal(createResponse.status, 200);
  const order = await createResponse.json() as any;

  const badUpdate = await internalRequest(`/orders/${order.id}`, {
    method: 'PUT',
    body: JSON.stringify({ actualAmount: 'abc' }),
  });
  assert.equal(badUpdate.status, 400, '非法金额必须报错而不是静默清零');

  const ordersAfter = await (await internalRequest('/orders')).json() as any[];
  const detail = ordersAfter.find(o => o.id === order.id);
  assert.ok(detail);
  assert.equal(detail.actualAmount, 1000, '原金额必须保持不变');
});

test('品牌改名与删除级联更新商单模板', async () => {
  const templateResponse = await internalRequest('/order-templates', {
    method: 'POST',
    body: JSON.stringify({
      name: '级联模板',
      title: '级联商单',
      type: 'paid',
      actualAmount: 800,
      brandName: '级联品牌',
      platforms: ['抖音'],
    }),
  });
  assert.equal(templateResponse.status, 200);

  const brandResponse = await internalRequest('/brands', {
    method: 'POST',
    body: JSON.stringify({ name: '级联品牌', industry: '测试' }),
  });
  assert.equal(brandResponse.status, 200);
  const brand = await brandResponse.json() as any;

  const renameResponse = await internalRequest(`/brands/${brand.id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: '级联品牌改' }),
  });
  assert.equal(renameResponse.status, 200);

  const templates = await (await internalRequest('/order-templates')).json() as any[];
  const renamed = templates.find(t => t.name === '级联模板');
  assert.ok(renamed);
  assert.equal(renamed.brandName, '级联品牌改', '模板品牌名必须跟随品牌改名');

  const deleteResponse = await internalRequest(`/brands/${brand.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
  const templatesAfterDelete = await (await internalRequest('/order-templates')).json() as any[];
  const cleared = templatesAfterDelete.find(t => t.name === '级联模板');
  assert.ok(cleared);
  assert.equal(cleared.brandName, null, '删除品牌后模板品牌名必须清空');
});

test('外部 API 导出与页面导出使用相同的备份版本并包含操作日志', async () => {
  db.prepare(`
    INSERT INTO activity_logs (id, userId, action, entityType, entityId, details)
    VALUES ('log-check', ?, 'create', 'order', 'log-check', '外部导出验证日志')
  `).run(primaryUserId);

  const internalExport = await (await internalRequest('/data/export')).json() as any;
  const externalExport = await (await externalRequest('/export')).json() as any;

  assert.equal(externalExport.backupVersion, internalExport.backupVersion, '两个导出入口的备份版本必须一致');
  assert.equal(externalExport.backupVersion, 4);
  assert.ok(Array.isArray(externalExport.activityLogs), '外部导出必须包含操作日志');
  assert.ok(externalExport.activityLogs.some((log: any) => log.id === 'log-check'));
});


test('外部导出恢复保留 API Key 与未包含的设置字段', async () => {
  // 造一份外部 API 风格的精简备份（settings 只有 displayName/email/bio，无 avatar/apiKey/开关）
  const externalBackup = {
    backupVersion: 4,
    orders: [{ id: uuidv4(), title: '外部恢复商单', type: 'paid', status: 'in_progress', actualAmount: 100 }],
    brands: [],
    payments: [],
    todos: [],
    assets: [],
    settings: { displayName: '外部昵称', email: 'primary@example.com', bio: '外部简介' },
  };

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(externalBackup),
  });
  assert.equal(importResponse.status, 200);

  const settingsRow = db.prepare('SELECT * FROM settings WHERE userId = ?').get(primaryUserId) as any;
  assert.equal(settingsRow.apiKey, 'primary-api-key', '精简设置恢复不得清空 API Key');
  assert.equal(settingsRow.displayName, '外部昵称');
  assert.equal(settingsRow.orderReminder, 1, '未包含的提醒开关必须保留原值');
  assert.equal(settingsRow.weeklyReport, 0, '未包含的周报开关必须保留原值');
  assert.equal(settingsRow.reportFrequency, 'weekly', '未包含的报告频率必须保留原值');
});

test('仅含操作日志的伪备份被拒绝', async () => {
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '日志伪备份保护');

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 4,
      activityLogs: [{ id: uuidv4(), action: 'login', entityType: 'user', entityId: 'x' }],
    }),
  });
  assert.equal(importResponse.status, 400, '仅日志不能构成有效业务备份');

  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM orders WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '拒绝后原有商单必须保留',
  );
});


test('删除商单保留已结算账单与已出售资产', async () => {
  const createResponse = await internalRequest('/orders', {
    method: 'POST',
    body: JSON.stringify({ title: '删单保账商单', type: 'paid', status: 'completed', actualAmount: 1500, brandName: '删单品牌' }),
  });
  assert.equal(createResponse.status, 200);
  const order = await createResponse.json() as any;

  const payments = await (await internalRequest('/payments')).json() as any[];
  const payment = payments.find(p => p.orderNo === order.orderNo);
  assert.ok(payment);
  const settle = await internalRequest(`/payments/${payment.id}/settle`, {
    method: 'PUT',
    body: JSON.stringify({ settled: true }),
  });
  assert.equal(settle.status, 200);

  const deleteResponse = await internalRequest(`/orders/${order.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
  const result = await deleteResponse.json() as any;
  assert.equal(result.keptPayments, 1, '删除商单应报告保留了已结算账单');

  const paymentsAfter = await (await internalRequest('/payments')).json() as any[];
  const kept = paymentsAfter.find(p => p.id === payment.id);
  assert.ok(kept, '已结算账单不随商单删除');
  assert.equal(kept.type, 'settled');
});

test('空 settings 对象无法绕过导入防护', async () => {
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '空设置防护商单');

  // 空数组集合 + 空 settings 对象：历史上会静默清空全部业务数据
  const bypass = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, orders: [], brands: [], settings: {} }),
  });
  assert.equal(bypass.status, 400, '空 settings 不得让空备份通过校验');
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM orders WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '拒绝后原有商单必须保留',
  );

  // 仅含 operationLogs + 空 settings 同样被拒绝
  const logsOnly = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, activityLogs: [{ id: uuidv4(), action: 'login' }], settings: {} }),
  });
  assert.equal(logsOnly.status, 400, '仅日志 + 空 settings 必须被拒绝');

  // 携带真实设置字段的备份（合法的“仅设置”恢复）仍可通过
  const settingsOnly = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, orders: [], settings: { displayName: '仅设置恢复' } }),
  });
  assert.equal(settingsOnly.status, 200, '携带真实字段的设置备份应允许');
});


test('仅恢复设置不会清空业务数据', async () => {
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '设置恢复保护商单');
  db.prepare('INSERT INTO todos (id, userId, content) VALUES (?, ?, ?)').run(uuidv4(), primaryUserId, '设置恢复保护待办');

  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, settings: { orderReminder: false } }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json() as any;
  assert.equal(preview.settingsOnly, true, '仅含设置应被标记为 settingsOnly');
  assert.deepEqual(preview.collections, [], '仅设置备份不应替换任何业务集合');

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, settings: { orderReminder: false } }),
  });
  assert.equal(importResponse.status, 200);
  const result = await importResponse.json() as any;
  assert.equal(result.settingsOnly, true);

  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM orders WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '仅恢复设置必须保留商单',
  );
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM todos WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '仅恢复设置必须保留待办',
  );
  const settingsRow = db.prepare('SELECT orderReminder FROM settings WHERE userId = ?').get(primaryUserId) as any;
  assert.equal(settingsRow.orderReminder, 0, '设置本身必须被更新');
});

test('部分集合备份只替换包含的集合', async () => {
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '待保留商单');
  db.prepare('INSERT INTO todos (id, userId, content) VALUES (?, ?, ?)').run(uuidv4(), primaryUserId, '待保留待办');

  const brandId = uuidv4();
  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 4,
      brands: [{ id: brandId, name: '部分备份品牌' }],
    }),
  });
  assert.equal(importResponse.status, 200);

  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM brands WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '备份中包含的品牌集合应被替换为备份内容',
  );
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM orders WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '备份未包含的商单集合必须保持原样',
  );
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM todos WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '备份未包含的待办集合必须保持原样',
  );
});

test('数字形式的通知开关可正确恢复', async () => {
  // 页面导出的开关是数据库原始值 0/1，恢复必须同时接受布尔与数字
  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 4,
      settings: { orderReminder: 0, weeklyReport: 1 },
    }),
  });
  assert.equal(importResponse.status, 200);

  const settingsRow = db.prepare('SELECT orderReminder, weeklyReport FROM settings WHERE userId = ?').get(primaryUserId) as any;
  assert.equal(settingsRow.orderReminder, 0, 'orderReminder: 0 应被识别为关闭');
  assert.equal(settingsRow.weeklyReport, 1, 'weeklyReport: 1 应被识别为开启');
});

test('版本化备份中的非法金额被拒绝而不是清零', async () => {
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '金额保护商单');

  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 4,
      orders: [{ id: uuidv4(), title: '坏金额商单', type: 'paid', status: 'in_progress', actualAmount: 'abc' }],
    }),
  });
  assert.equal(previewResponse.status, 400, '预检应拒绝无法解析的金额');

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 4,
      orders: [{ id: uuidv4(), title: '坏金额商单', type: 'paid', status: 'in_progress', actualAmount: 'abc' }],
    }),
  });
  assert.equal(importResponse.status, 400, '导入应拒绝无法解析的金额');
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM orders WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '拒绝后原有商单必须保留',
  );

  // 旧版备份（无版本号）仍走容忍路径：记录清洗项但不拒绝
  const legacyResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({
      orders: [{ id: uuidv4(), title: '旧版坏金额商单', type: 'paid', status: 'in_progress', actualAmount: 'abc' }],
    }),
  });
  assert.equal(legacyResponse.status, 200, '旧版备份保持兼容（清洗并继续）');
});

test('预检会列出将被改写或丢弃的数据', async () => {
  const response = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 4,
      orders: [
        { id: uuidv4(), title: '非法状态商单', type: 'weird', status: 'weird', actualAmount: -5 },
        { id: uuidv4(), title: '非法日期商单', type: 'paid', status: 'in_progress', acceptDate: 'not-a-date' },
      ],
      publishLinks: [{ id: uuidv4(), orderId: 'ghost-order', platform: '抖音', url: 'javascript:alert(1)' }],
    }),
  });
  assert.equal(response.status, 200);
  const preview = await response.json() as any;
  assert.ok(preview.adjustments, '预检必须返回清洗统计');
  assert.ok(preview.adjustments.invalidAmounts >= 1, '应统计非法金额');
  assert.ok(preview.adjustments.invalidDates >= 1, '应统计非法日期');
  assert.ok(preview.adjustments.invalidEnums >= 1, '应统计非法枚举');
  assert.ok(preview.adjustments.droppedLinks >= 1, '应统计被丢弃的关联记录');
  assert.ok(
    preview.warnings.some((w: string) => w.includes('金额') || w.includes('日期') || w.includes('丢弃')),
    '预检 warnings 必须向用户说明将被改写的内容',
  );
});


test('会话代数能在账号切换后使在途请求失效', async () => {
  const { getSessionEpoch, isSessionCurrent, bumpSessionEpoch, invalidateAllCache } = await import('../src/store/cache.ts');

  // 模拟：账号 A 发起请求时记录代数
  const requestEpoch = getSessionEpoch();
  assert.equal(isSessionCurrent(requestEpoch), true, '同一会话内的请求应被接受');

  // 切换账号（登出或登录都会递增代数）
  bumpSessionEpoch();

  assert.equal(isSessionCurrent(requestEpoch), false, '账号切换后旧请求的代数必须失效');
  assert.equal(getSessionEpoch() > requestEpoch, true, '代数必须单调递增');

  // 新会话发起的请求仍然有效
  const nextEpoch = getSessionEpoch();
  assert.equal(isSessionCurrent(nextEpoch), true);

  // 缓存必须被清空（避免跨账号读到上一个账号的缓存）
  invalidateAllCache();
  assert.equal(isSessionCurrent(nextEpoch), true, '清缓存不应影响当代请求');
});

test('导入只替换备份中存在的集合（缺失集合保留）', async () => {
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '保留校验商单');

  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, payments: [{ id: uuidv4(), brand: '仅账单品牌', amount: 66 }] }),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json() as any;
  assert.deepEqual(preview.collections, ['payments'], '预检应只报告备份中存在的集合');
  assert.equal(preview.settingsOnly, false);

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, payments: [{ id: uuidv4(), brand: '仅账单品牌', amount: 66 }] }),
  });
  assert.equal(importResponse.status, 200);

  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM payments WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '账单集合应被备份内容替换',
  );
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM orders WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '备份未包含的商单集合必须保留',
  );
});


test('只恢复关联数据时不再静默丢弃（关联到库中既有商单）', async () => {
  // 库中已存在的商单
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status)
    VALUES (?, ?, ?, ?, 'paid', 'in_progress')
  `).run(orderId, primaryUserId, `ORD-${uuidv4()}`, '既有商单');

  // 备份只包含该商单的一条评论（不含 orders 集合）
  const restoreResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 4,
      comments: [{ id: uuidv4(), orderId, content: '既有商单的评论' }],
    }),
  });
  assert.equal(restoreResponse.status, 200);
  const result = await restoreResponse.json() as any;
  assert.deepEqual(result.replacedCollections, ['comments']);
  assert.equal(result.droppedRelations.comments, 0, '关联到库中既有商单的评论不应被丢弃');
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM comments WHERE userId = ?').get(primaryUserId) as any).count,
    1,
    '评论必须真正写入',
  );

  // 发布链接与推广记录同样支持关联既有商单
  const linkResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 4,
      publishLinks: [{ id: uuidv4(), orderId, platform: '抖音', url: 'https://example.com/a' }],
      paidPromotions: [{ id: uuidv4(), orderId, platform: '抖音', amount: 50 }],
    }),
  });
  assert.equal(linkResponse.status, 200);
  const linkResult = await linkResponse.json() as any;
  assert.equal(linkResult.droppedRelations.links, 0);
  assert.equal(linkResult.droppedRelations.promotions, 0);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM publish_links WHERE userId = ?').get(primaryUserId) as any).count, 1);
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM paid_promotions WHERE userId = ?').get(primaryUserId) as any).count, 1);
});

test('关联到不存在商单的记录会被丢弃并在响应中说明', async () => {
  const response = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({
      backupVersion: 4,
      comments: [{ id: uuidv4(), orderId: 'ghost-order-id', content: '孤立评论' }],
      publishLinks: [{ id: uuidv4(), orderId: 'ghost-order-id', platform: '抖音', url: 'https://example.com/b' }],
    }),
  });
  assert.equal(response.status, 200);
  const result = await response.json() as any;
  assert.equal(result.droppedRelations.comments, 1, '孤立评论应被计数');
  assert.equal(result.droppedRelations.links, 1, '孤立链接应被计数');
  assert.equal((db.prepare('SELECT COUNT(*) AS count FROM comments WHERE userId = ?').get(primaryUserId) as any).count, 0);
});

test('WebDAV：服务器无版本响应头时拒绝静默覆盖，强制时才写入', async () => {
  installBrowserStubs();
  const webdav = await import('../src/lib/webdav.ts');
  const config = { url: 'https://dav.example.com/dav/', username: 'u', password: 'p', syncInterval: '0' };
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; headers: Record<string, string> }> = [];

  // 桩：GET 返回一份无 ETag / 无 Last-Modified 的备份；PUT 记录请求头
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase();
    const headers = (init?.headers || {}) as Record<string, string>;
    calls.push({ method, headers });
    if (method === 'GET') {
      return new Response(JSON.stringify({ backupVersion: 4, exportedAt: '2026-01-01T00:00:00.000Z', orders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('', { status: 201 });
  }) as typeof fetch;

  try {
    // 无版本标记且未强制：必须抛冲突错误，而不是无条件覆盖
    await assert.rejects(
      () => webdav.uploadWebdavBackup(config, {}),
      (error: unknown) => error instanceof webdav.WebdavConflictError,
      '缺少版本响应头时应拒绝静默覆盖',
    );
    assert.equal(
      calls.some(call => call.method === 'PUT'),
      false,
      '被拒绝时不应发出 PUT',
    );

    // 强制覆盖：允许写入，但仍会先保存历史副本（PUT 历史 + PUT 备份）
    const result = await webdav.uploadWebdavBackup(config, { force: true });
    assert.ok(result.syncedAt, '强制覆盖应返回同步时间');
    assert.ok(calls.filter(call => call.method === 'PUT').length >= 2, '强制覆盖应写入历史副本与主备份');
  } finally {
    globalThis.fetch = originalFetch;
    removeBrowserStubs();
  }
});

test('WebDAV：会话切换会中止同步，不会上传到旧账号目录', async () => {
  installBrowserStubs();
  const webdav = await import('../src/lib/webdav.ts');
  const config = { url: 'https://dav.example.com/dav/', username: 'u', password: 'p', syncInterval: '0' };
  const originalFetch = globalThis.fetch;
  let putCount = 0;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'GET') {
      // 在探测云端的过程中切换账号（模拟"读取期间用户切号"）
      webdav.bumpWebdavSession();
      return new Response(JSON.stringify({ backupVersion: 4, exportedAt: '2026-01-01T00:00:00.000Z', orders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"v1"' },
      });
    }
    if (method === 'PUT') putCount += 1;
    return new Response('', { status: 201 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => webdav.uploadWebdavBackup(config, { force: true }),
      (error: unknown) => error instanceof Error && error.message.includes('账号已切换'),
      '会话切换后必须中止同步',
    );
    assert.equal(putCount, 0, '会话已切换时不得发出任何 PUT');
  } finally {
    globalThis.fetch = originalFetch;
    removeBrowserStubs();
  }
});

test('导出会随附体积与条数预警字段', async () => {
  const response = await internalRequest('/data/export');
  assert.equal(response.status, 200);
  const backup = await response.json() as any;
  assert.ok(Array.isArray(backup.exportWarnings), '导出必须包含 exportWarnings 字段');
  assert.ok(backup.counts, '导出必须包含 counts');
});

test('所有 store 写入点都必须带会话守卫（防止新增路径遗漏）', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join: joinPath } = await import('node:path');
  const slicesDir = joinPath(process.cwd(), 'src', 'store', 'slices');
  const files = readdirSync(slicesDir).filter(name => name.endsWith('.ts') && !name.startsWith('authSlice'));

  const offenders: string[] = [];
  for (const file of files) {
    const source = readFileSync(joinPath(slicesDir, file), 'utf8');
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      // 写入点：setCache( / set((state) / set({
      if (!/(^|\s)(setCache\(|set\(\(state\)|set\(\{)/.test(line)) return;
      // 允许 set({ isAuthenticated... }) 之类由 authSlice 负责的会话切换（已排除 authSlice 文件）
      const window = lines.slice(Math.max(0, index - 6), index).join('\n');
      if (!window.includes('isSessionCurrent(epoch)')) {
        offenders.push(`${file}:${index + 1} ${line.trim().slice(0, 60)}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `以下写入点缺少会话守卫：\n${offenders.join('\n')}`,
  );
});

// ===== ⑤ 备份可恢复性风险：留档记录 + 提示不自动消失的源码契约 =====

test('备份风险与关键警告：留档、手动关闭、账号隔离（源码契约 + 行为）', async () => {
  const { readFileSync } = await import('node:fs');
  const toastSource = readFileSync('src/components/Toast.tsx', 'utf8');
  const settingsSource = readFileSync('src/pages/Settings.tsx', 'utf8');
  const manualSyncSource = readFileSync('src/hooks/useWebdavSync.ts', 'utf8');
  const autoSyncSource = readFileSync('src/hooks/useWebdavAutoSync.ts', 'utf8');
  const backupTabSource = readFileSync('src/components/settings/BackupTab.tsx', 'utf8');

  // 提示层必须支持"手动关闭"（不自动消失）
  assert.ok(
    /if \(toast\.persistent\) return;/.test(toastSource),
    'Toast 必须对 persistent 提示跳过自动关闭计时器',
  );

  // 三条备份路径的警告都要走"不自动消失"并留档
  for (const [name, source, marker] of [
    ['本地导出', settingsSource, 'saveBackupRisk(warnings, \'export\')'],
    ['手动同步', manualSyncSource, 'saveBackupRisk(result.exportWarnings, \'webdav\')'],
    ['自动同步', autoSyncSource, 'saveBackupRisk(result.exportWarnings, \'webdav\')'],
  ] as const) {
    assert.ok(source.includes(marker), `${name} 必须记录备份风险留档`);
  }
  assert.ok(
    (settingsSource.match(/persistent: true/g) || []).length >= 1,
    '导出警告提示必须标记为需手动关闭',
  );
  assert.ok(
    (manualSyncSource.match(/persistent: true/g) || []).length >= 1,
    '手动同步警告提示必须标记为需手动关闭',
  );
  assert.ok(
    (autoSyncSource.match(/persistent: true/g) || []).length >= 1,
    '自动同步警告提示必须标记为需手动关闭',
  );

  // 数据管理页必须展示留档风险并支持忽略
  assert.ok(backupTabSource.includes('backupRisk'), '数据管理页必须展示备份风险留档');
  assert.ok(backupTabSource.includes('忽略'), '数据管理页必须提供手动忽略入口');
});

// ===== ② 复核轮次记录：这轮修复涉及的关键行为必须有自动化覆盖 =====
test('关键修复行为都有自动化测试覆盖（防回退清单）', async () => {
  const { readFileSync } = await import('node:fs');
  const regression = readFileSync('tests/regressions.test.ts', 'utf8');
  const e2eIsolation = readFileSync('tests/e2e/account-isolation.spec.ts', 'utf8');
  const e2eInteractions = readFileSync('tests/e2e/interactions.spec.ts', 'utf8');
  const e2eModal = readFileSync('tests/e2e/modal-centering.spec.ts', 'utf8');
  const e2eTodos = readFileSync('tests/e2e/todos.spec.ts', 'utf8');
  const e2eBackupRisk = readFileSync('tests/e2e/backup-risk.spec.ts', 'utf8');

  const required: Array<[string, boolean]> = [
    ['空备份被拒绝', regression.includes('空备份')],
    ['仅设置恢复不清空业务数据', regression.includes('仅恢复设置不会清空业务数据')],
    ['部分集合备份只替换包含的集合', regression.includes('部分集合备份只替换包含的集合')],
    ['只恢复关联数据不静默丢弃', regression.includes('只恢复关联数据时不再静默丢弃')],
    ['数字开关可恢复', regression.includes('数字形式的通知开关可正确恢复')],
    ['非法金额被拒绝', regression.includes('版本化备份中的非法金额被拒绝')],
    ['WebDAV 无版本头拒绝覆盖', regression.includes('服务器无版本响应头时拒绝静默覆盖')],
    ['WebDAV 会话切换中止同步', regression.includes('会话切换会中止同步')],
    ['会话代数使在途请求失效', regression.includes('会话代数能在账号切换后使在途请求失效')],
    ['store 写入点守卫覆盖', regression.includes('所有 store 写入点都必须带会话守卫')],
    ['导出带预警字段', regression.includes('导出会随附体积与条数预警字段')],
    ['同页面切换账号隔离（读）', e2eIsolation.includes('旧账号的读取响应不会写入新账号状态')],
    ['同页面切换账号隔离（写）', e2eIsolation.includes('旧账号的写操作响应不会写入新账号状态')],
    ['触屏按钮可见', e2eInteractions.includes('触屏下品牌操作按钮可见且可点击')],
    ['删除中 Esc 不关闭', e2eInteractions.includes('删除进行中按 Esc 不会关闭确认框')],
    ['列表分页入口', e2eInteractions.includes('列表提供分页加载入口')],
    ['弹窗视口居中', e2eModal.includes('弹窗相对视口居中')],
    ['WebDAV 排队任务绑定会话', regression.includes('排队中的任务在账号切换后作废')],
    ['WebDAV 完成阶段校验会话', regression.includes('上传收尾前切换账号，不把同步基线写进新账号')],
    ['部分恢复清理孤儿关联记录', regression.includes('替换商单会清理指向旧商单的关联记录')],
    ['导出体积按 UTF-8 字节判断', regression.includes('导出体积预警按 UTF-8 字节数计算')],
    ['导出预警传达给用户', regression.includes('导出预警会被格式化为用户可见提示')],
    ['WebDAV 上传带回导出预警', regression.includes('WebDAV 上传会把导出的可恢复性预警带回给调用方')],
    ['取消覆盖响应体读取阶段', regression.includes('账号切换会中止正在读取响应体的请求')],
    ['列表接口分页与总数', regression.includes('列表接口支持服务端分页并返回总数')],
    ['旧保存不关闭新表单（E2E）', e2eInteractions.includes('旧保存响应不会关闭新打开的表单')],
    ['任务与日程页全流程（E2E）', e2eTodos.includes('任务与日程页完整流程可用')],
    ['任务页深链参数（E2E）', e2eTodos.includes('任务页深链参数生效')],
    ['品牌依赖：替换品牌解绑待办', regression.includes('替换品牌会解绑指向旧品牌的待办')],
    ['品牌依赖：只恢复待办保留关联', regression.includes('只恢复待办时保留库中仍存在的品牌关联')],
    ['备份风险留档与手动忽略', regression.includes('备份风险记录按账号留档')],
    ['备份风险提示可回看（E2E）', e2eBackupRisk.includes('备份风险提示可在数据管理页回看')],
    ['品牌改名：导入与手动路径一致', regression.includes('导入路径与手动改名对依赖记录的结果一致')],
    ['品牌删除：导入与手动路径一致', regression.includes('导入路径与手动删除对依赖记录的结果一致')],
    ['待办分类兑现预检承诺', regression.includes('品牌解析失败时分类一并清空')],
    ['WebDAV 非 ASCII 密码可认证', regression.includes('含中文或 emoji 时仍可生成正确的 Basic 头')],
    ['导入成功不误报失败', regression.includes('导入成功后刷新失败不得报告')],
    ['空数据图表有空状态（E2E）', e2eInteractions.includes('空账号的图表显示空状态而不是空图框')],
    ['多品牌互换改名不串改', regression.includes('各品牌关联记录必须各自改名')],
    ['无 ID 旧品牌保留同名关联', regression.includes('同名关联必须保留')],
    ['表单标签关联输入框（E2E）', e2eInteractions.includes('表单标签与输入框正确关联')],
  ];

  const missing = required.filter(([, present]) => !present).map(([name]) => name);
  assert.deepEqual(missing, [], `以下行为缺少自动化覆盖：${missing.join('、')}`);
});

// ===== ④ 第四轮复核：排队任务会话绑定 / 恢复依赖清理 / 预警传达 / 取消覆盖响应体 =====

test('WebDAV：排队中的任务在账号切换后作废，不再执行', async () => {
  installBrowserStubs();
  const webdav = await import('../src/lib/webdav.ts');
  const config = { url: 'https://dav.example.com/dav/', username: 'u', password: 'p', syncInterval: '0' };
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let releaseProbe: (() => void) | null = null;
  const probeGate = new Promise<void>(resolve => { releaseProbe = resolve; });
  let getCount = 0;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase();
    requests.push(method);
    if (method === 'GET') {
      getCount += 1;
      // 第一个任务卡在"探测云端"，制造出第二个任务在队列中等待的窗口
      if (getCount === 1) await probeGate;
      return new Response(JSON.stringify({ backupVersion: 4, exportedAt: '2026-01-01T00:00:00.000Z', orders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"v1"' },
      });
    }
    return new Response('', { status: 201 });
  }) as typeof fetch;

  try {
    const first = webdav.uploadWebdavBackup(config, { force: true });
    // 等第一个任务真正开始执行（此时它已卡在探测云端的闸门上）
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(getCount, 1, '第一个任务应已发出探测请求');
    // 第二个任务在第一个仍未完成时入队（此时仍是 A 账号）
    const second = webdav.uploadWebdavBackup(config, { force: true });
    // 切换账号（B）：排队中的任务必须在"入队时绑定的会话"下作废
    webdav.bumpWebdavSession();
    releaseProbe!();

    await assert.rejects(
      () => first,
      (error: unknown) => error instanceof webdav.WebdavSessionCancelledError,
      '执行中的任务在切号后必须作废',
    );
    await assert.rejects(
      () => second,
      (error: unknown) => error instanceof webdav.WebdavSessionCancelledError,
      '排队中的任务在切号后必须作废（不能等执行时才捕获账号）',
    );
    assert.equal(getCount, 1, '作废的排队任务不得发出任何探测请求');
    assert.equal(requests.some(method => method === 'PUT'), false, '作废的排队任务不得上传');
  } finally {
    globalThis.fetch = originalFetch;
    removeBrowserStubs();
  }
});

test('WebDAV：上传收尾前切换账号，不把同步基线写进新账号', async () => {
  installBrowserStubs();
  const webdav = await import('../src/lib/webdav.ts');
  const config = { url: 'https://dav.example.com/dav/', username: 'u', password: 'p', syncInterval: '0' };
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'GET') {
      return new Response(JSON.stringify({ backupVersion: 4, exportedAt: '2026-01-01T00:00:00.000Z', orders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"v1"' },
      });
    }
    // 主备份 PUT 的响应返回后、写入"上次同步时间"之前切号
    if (method === 'PUT' && init?.body && String(init.body).length > 2) {
      webdav.bumpWebdavSession();
    }
    return new Response('', { status: 201 });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => webdav.uploadWebdavBackup(config, { force: true }),
      (error: unknown) => error instanceof webdav.WebdavSessionCancelledError,
      '完成阶段校验发现切号后必须按"任务作废"处理',
    );
    assert.equal(webdav.loadWebdavLastSync(), null, '不得把旧任务的同步时间写入新账号作用域');
    assert.equal(webdav.loadWebdavRemoteState(), null, '不得把旧任务的云端基准写入新账号作用域');
  } finally {
    globalThis.fetch = originalFetch;
    removeBrowserStubs();
  }
});

test('部分恢复：替换商单会清理指向旧商单的关联记录，并在预检中说明', async () => {
  const orderId = uuidv4();
  db.prepare('INSERT INTO orders (id, userId, orderNo, title, type, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, primaryUserId, 'OLD-1', '旧商单', 'paid', 'in_progress');
  db.prepare('INSERT INTO comments (id, userId, orderId, content) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), primaryUserId, orderId, '旧评论');
  db.prepare('INSERT INTO publish_links (id, orderId, userId, platform, url) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), orderId, primaryUserId, '小红书', 'https://example.com/x');
  db.prepare('INSERT INTO paid_promotions (id, orderId, userId, platform, amount) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), orderId, primaryUserId, '抖音', 88);
  const todoId = uuidv4();
  db.prepare('INSERT INTO todos (id, userId, content, orderId) VALUES (?, ?, ?, ?)')
    .run(todoId, primaryUserId, '商单任务: 旧商单', orderId);
  const assetId = uuidv4();
  db.prepare('INSERT INTO assets (id, userId, orderId, productName) VALUES (?, ?, ?, ?)')
    .run(assetId, primaryUserId, orderId, '旧资产');

  const payload = {
    backupVersion: 4,
    orders: [{ id: uuidv4(), orderNo: 'NEW-1', title: '备份里的商单', type: 'paid', status: 'in_progress' }],
  };

  // 预检必须说明：这些关联记录将在恢复时被清理/解绑
  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(previewResponse.status, 200);
  const preview = await previewResponse.json() as any;
  assert.deepEqual(
    preview.orphans,
    { comments: 1, links: 1, promotions: 1, todos: 1, assets: 1, todoBrands: 0 },
    '预检必须给出依赖关系的处理预告',
  );
  assert.ok(
    preview.warnings.some((warning: string) => warning.includes('评论') && warning.includes('清理')),
    '预检警告必须说明评论会被清理',
  );
  assert.ok(
    preview.warnings.some((warning: string) => warning.includes('资产') && warning.includes('解除与商单的关联')),
    '预检警告必须说明资产会解除关联',
  );

  // 只替换商单：旧实现会因外键约束整次失败，新实现必须成功并清理孤儿
  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(importResponse.status, 200, '只恢复商单不应因关联记录的外键而失败');
  const result = await importResponse.json() as any;
  assert.deepEqual(
    result.orphanedRelations,
    { comments: 1, links: 1, promotions: 1, todos: 1, assets: 1, todoBrands: 0 },
    '响应必须报告被清理/解绑的记录数',
  );

  const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE userId = ?`)
    .get(primaryUserId) as { count: number }).count;
  assert.equal(count('comments'), 0, '指向已消失商单的评论必须被清理');
  assert.equal(count('publish_links'), 0, '指向已消失商单的发布链接必须被清理');
  assert.equal(count('paid_promotions'), 0, '指向已消失商单的推广记录必须被清理');
  assert.equal(
    (db.prepare('SELECT orderId FROM todos WHERE id = ?').get(todoId) as { orderId: string | null }).orderId,
    null,
    '待办必须解除与已消失商单的关联',
  );
  assert.ok(
    String((db.prepare('SELECT orderId FROM assets WHERE id = ?').get(assetId) as { orderId: string }).orderId).startsWith('imported-'),
    '资产必须标记为已脱离商单，而不是留下悬空引用',
  );
  assert.equal(count('orders'), 1, '备份中的商单必须写入');
});

test('部分恢复：同 ID 覆盖商单时不因外键失败，且保留仍指向该商单的关联记录', async () => {
  const orderId = uuidv4();
  db.prepare('INSERT INTO orders (id, userId, orderNo, title, type, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orderId, primaryUserId, 'SAME-1', '原名商单', 'paid', 'in_progress');
  db.prepare('INSERT INTO publish_links (id, orderId, userId, platform, url) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), orderId, primaryUserId, '小红书', 'https://example.com/same');
  db.prepare('INSERT INTO paid_promotions (id, orderId, userId, platform, amount) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), orderId, primaryUserId, '抖音', 12);
  const ghostCommentId = uuidv4();
  db.prepare('INSERT INTO comments (id, userId, orderId, content) VALUES (?, ?, ?, ?)')
    .run(ghostCommentId, primaryUserId, 'ghost-order', '孤儿评论');

  // 备份里用同一个商单 ID（同账号覆盖恢复的常见形态），只替换商单集合
  const payload = {
    backupVersion: 4,
    orders: [{ id: orderId, orderNo: 'SAME-1', title: '改名后的商单', type: 'paid', status: 'in_progress' }],
  };
  const response = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200, '同 ID 覆盖商单不得因关联记录的外键约束失败');
  const result = await response.json() as any;
  assert.equal(result.orphanedRelations.links, 0, '仍指向该商单的发布链接必须保留');
  assert.equal(result.orphanedRelations.promotions, 0, '仍指向该商单的推广记录必须保留');
  assert.equal(result.orphanedRelations.comments, 1, '指向已消失商单的评论必须被清理');

  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM publish_links WHERE userId = ?').get(primaryUserId) as { count: number }).count,
    1,
    '父商单仍在，发布链接必须保留',
  );
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM paid_promotions WHERE userId = ?').get(primaryUserId) as { count: number }).count,
    1,
    '父商单仍在，推广记录必须保留',
  );
  assert.equal(
    (db.prepare('SELECT COUNT(*) AS count FROM comments WHERE userId = ?').get(primaryUserId) as { count: number }).count,
    0,
    '孤儿评论必须清理',
  );
  assert.equal(
    (db.prepare('SELECT title FROM orders WHERE id = ?').get(orderId) as { title: string }).title,
    '改名后的商单',
    '商单必须被备份内容替换',
  );
});

test('导出体积预警按 UTF-8 字节数计算（中文不会被低估而漏报）', async () => {
  const { buildExportSizeWarning, measureUtf8Bytes, parseBodyLimitBytes } = await import('../src/server/requestBodyLimits.ts');
  const limitBytes = parseBodyLimitBytes('1mb');
  // 40 万个中文字符：字符数 40 万（远低于 1MB 的 95%），UTF-8 字节数 120 万（超过阈值）
  const cjkPayload = `{"a":"${'中'.repeat(400_000)}"}`;
  assert.ok(cjkPayload.length < limitBytes * 0.95, '构造的载荷字符数必须低于阈值（旧逻辑正是在这里漏报）');
  assert.ok(measureUtf8Bytes(cjkPayload) > limitBytes * 0.95, '同一载荷的 UTF-8 字节数必须超过阈值');

  const warning = buildExportSizeWarning(cjkPayload, limitBytes, '1mb');
  assert.ok(warning && warning.includes('接近导入上限'), '按字节计算时必须给出体积预警');
  assert.equal(buildExportSizeWarning('{"a":"short"}', limitBytes, '1mb'), null, '远低于上限时不应误报');
});

test('导出预警会被格式化为用户可见提示（导出与 WebDAV 上传共用）', async () => {
  const { extractExportWarnings, formatExportWarningMessage } = await import('../src/lib/backupNotice.ts');
  assert.deepEqual(extractExportWarnings({ exportWarnings: ['集合 orders 超限', '', 42] }), ['集合 orders 超限']);
  assert.deepEqual(extractExportWarnings(null), []);
  assert.deepEqual(extractExportWarnings({}), []);
  assert.equal(formatExportWarningMessage([], '前缀'), null, '无预警时返回 null，由调用方给出普通成功提示');
  assert.equal(
    formatExportWarningMessage(['集合 orders 超限'], '数据已导出，但这份备份可能无法直接恢复'),
    '数据已导出，但这份备份可能无法直接恢复：集合 orders 超限',
  );
});

test('WebDAV 上传会把导出的可恢复性预警带回给调用方', async () => {
  installBrowserStubs();
  const webdav = await import('../src/lib/webdav.ts');
  const config = { url: 'https://dav.example.com/dav/', username: 'u', password: 'p', syncInterval: '0' };
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || 'GET').toUpperCase();
    if (url.includes('/api/data/export')) {
      return new Response(JSON.stringify({
        backupVersion: 4,
        exportedAt: '2026-02-02T00:00:00.000Z',
        orders: [],
        exportWarnings: ['集合 orders 有 300000 条，超过单次导入上限'],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (method === 'GET') {
      return new Response(JSON.stringify({ backupVersion: 4, exportedAt: '2026-01-01T00:00:00.000Z', orders: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"v1"' },
      });
    }
    return new Response('', { status: 201 });
  }) as typeof fetch;

  try {
    const result = await webdav.uploadWebdavBackup(config, { force: true });
    assert.deepEqual(
      result.exportWarnings,
      ['集合 orders 有 300000 条，超过单次导入上限'],
      '上传结果必须带上导出的可恢复性预警，供界面提示用户',
    );
  } finally {
    globalThis.fetch = originalFetch;
    removeBrowserStubs();
  }
});

test('账号切换会中止正在读取响应体的请求，旧数据不会交给调用方', async () => {
  installBrowserStubs();
  const { apiFetch, abortSessionRequests, isSessionAbort } = await import('../src/lib/api.ts');
  const originalFetch = globalThis.fetch;

  const createAbortError = () => Object.assign(new Error('请求已中止'), { name: 'AbortError' });

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = (init as RequestInit | undefined)?.signal;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // 50ms 后才给出响应体：留出"读取期间切换账号"的窗口
        const timer = setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ account: 'A', orders: [{ id: 'a-1' }] })));
          controller.close();
        }, 50);
        signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          controller.error(createAbortError());
        }, { once: true });
      },
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const response = await apiFetch('/api/orders');
    const bodyPromise = response.json();
    // 读取响应体期间切换账号：登记必须仍然有效，从而中止读取而不是把旧账号数据交出去
    abortSessionRequests();
    await assert.rejects(
      () => bodyPromise,
      (error: unknown) => isSessionAbort(error),
      '响应体读取阶段必须能被会话切换中止',
    );

    // 即使响应体在切换前就已经读入内存，也不允许把内容交给调用方
    const directResponse = await apiFetch('/api/orders');
    await new Promise(resolve => setTimeout(resolve, 80));
    abortSessionRequests();
    await assert.rejects(
      () => directResponse.json(),
      (error: unknown) => isSessionAbort(error),
      '会话已切换时读取结果必须按中止处理',
    );
  } finally {
    globalThis.fetch = originalFetch;
    removeBrowserStubs();
  }
});

test('列表接口支持服务端分页并返回总数（默认仍全量，行为向后兼容）', async () => {
  for (let index = 0; index < 3; index += 1) {
    const response = await internalRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        title: `分页商单 ${index + 1}`,
        type: 'paid',
        status: 'in_progress',
        actualAmount: 100 + index,
      }),
    });
    assert.equal(response.status, 200);
  }

  const all = await internalRequest('/orders');
  const allBody = await all.json() as unknown[];
  assert.equal(allBody.length, 3, '不传分页参数时仍返回全量（既有调用方不受影响）');
  assert.equal(all.headers.get('x-total-count'), '3', '必须返回总数');

  const page = await internalRequest('/orders?limit=1&offset=1');
  const pageBody = await page.json() as Array<{ title: string }>;
  assert.equal(pageBody.length, 1, 'limit 必须生效');
  assert.equal(page.headers.get('x-total-count'), '3', '分页时总数仍是全量条数，供"加载更多"判断是否还有下一页');

  // 其余列表接口同样提供总数（含此前完全不分页的资产列表）
  db.prepare('INSERT INTO payments (id, userId, brand, amount, type) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), primaryUserId, '分页品牌', 10, 'pending');
  db.prepare('INSERT INTO todos (id, userId, content) VALUES (?, ?, ?)')
    .run(uuidv4(), primaryUserId, '分页待办');
  db.prepare('INSERT INTO brands (id, userId, name) VALUES (?, ?, ?)')
    .run(uuidv4(), primaryUserId, '分页品牌');
  db.prepare('INSERT INTO assets (id, userId, orderId, productName) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), primaryUserId, 'order-x', '分页资产');

  const tables: Array<[string, string]> = [
    ['/payments', 'payments'],
    ['/todos', 'todos'],
    ['/brands', 'brands'],
    ['/assets', 'assets'],
  ];
  for (const [path, table] of tables) {
    const expected = (db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE userId = ?`)
      .get(primaryUserId) as { count: number }).count;
    assert.ok(expected > 0, `${table} 应有测试数据`);
    const response = await internalRequest(path);
    assert.equal(response.status, 200, `${path} 必须可用`);
    assert.equal(response.headers.get('x-total-count'), String(expected), `${path} 必须返回真实总数`);
    const body = await response.json() as unknown[];
    assert.equal(body.length, expected, `${path} 默认仍返回全量`);
  }

  const assetsPage = await internalRequest('/assets?limit=1&offset=0');
  assert.equal((await assetsPage.json() as unknown[]).length, 1);
  assert.equal(assetsPage.headers.get('x-total-count'), '1');
});

// ===== ⑤ 第五轮复核：品牌依赖（保留 / 重新映射 / 解除关联）与备份风险留档 =====

test('部分恢复：替换品牌会解绑指向旧品牌的待办，并在预检中说明', async () => {
  const brandId = uuidv4();
  db.prepare('INSERT INTO brands (id, userId, name, industry) VALUES (?, ?, ?, ?)')
    .run(brandId, primaryUserId, '旧品牌', '数码');
  const todoId = uuidv4();
  db.prepare('INSERT INTO todos (id, userId, content, category, brandId) VALUES (?, ?, ?, ?, ?)')
    .run(todoId, primaryUserId, '品牌相关待办', '旧品牌', brandId);
  // 恢复前就已悬空的品牌 ID（历史脏数据）：同样会导致带原关联更新 404，一并清理
  const danglingTodoId = uuidv4();
  db.prepare('INSERT INTO todos (id, userId, content, category, brandId) VALUES (?, ?, ?, ?, ?)')
    .run(danglingTodoId, primaryUserId, '悬空品牌待办', '幽灵品牌', 'ghost-brand');

  // 只恢复品牌：旧品牌被替换成新品牌，待办的品牌关联会变成悬空引用
  const payload = { backupVersion: 4, brands: [{ id: uuidv4(), name: '新品牌', industry: '家居' }] };

  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const preview = await previewResponse.json() as any;
  assert.equal(
    preview.orphans.todoBrands,
    2,
    '预检必须预报全部会解除品牌关联的待办（含恢复前就已悬空的引用）',
  );
  assert.ok(
    preview.warnings.some((warning: string) => warning.includes('解除与品牌的关联')),
    '预检警告必须说明品牌关联的影响',
  );

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(importResponse.status, 200);
  const result = await importResponse.json() as any;
  assert.equal(
    result.orphanedRelations.todoBrands,
    2,
    '响应必须报告解除品牌关联的待办数（含恢复前就已悬空的一条）',
  );

  const danglingTodo = db.prepare('SELECT brandId FROM todos WHERE id = ?')
    .get(danglingTodoId) as { brandId: string | null };
  assert.equal(danglingTodo.brandId, null, '恢复前就悬空的品牌 ID 也必须清理');

  const todo = db.prepare('SELECT brandId, category FROM todos WHERE id = ?')
    .get(todoId) as { brandId: string | null; category: string | null };
  assert.equal(todo.brandId, null, '指向已删除品牌的品牌 ID 必须清空');
  assert.equal(todo.category, null, '分类文本与手动删除品牌的处理保持一致（一并清空）');

  // 关键回归（用户复现）：解除关联后，带原关联更新不应再返回 404
  const updateResponse = await internalRequest(`/todos/${todoId}/update`, {
    method: 'PUT',
    body: JSON.stringify({ content: '品牌相关待办', completed: true }),
  });
  assert.equal(updateResponse.status, 200, '解除关联后带原关联更新不应再返回 404「关联品牌不存在」');
});

test('部分恢复：只恢复待办时保留库中仍存在的品牌关联', async () => {
  const brandId = uuidv4();
  db.prepare('INSERT INTO brands (id, userId, name, industry) VALUES (?, ?, ?, ?)')
    .run(brandId, primaryUserId, '保留品牌', '数码');

  const keepTodoId = uuidv4();
  const payload = {
    backupVersion: 4,
    todos: [
      { id: keepTodoId, content: '关联既有品牌的任务', category: '保留品牌', brandId },
      { id: uuidv4(), content: '关联不存在品牌的任务', category: '幽灵品牌', brandId: 'ghost-brand-id' },
    ],
  };

  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const preview = await previewResponse.json() as any;
  assert.equal(preview.orphans.todoBrands, 1, '预检只应预报无法解析的那一条');

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(importResponse.status, 200);
  const result = await importResponse.json() as any;
  assert.equal(result.orphanedRelations.todoBrands, 1);

  const kept = db.prepare('SELECT brandId FROM todos WHERE id = ?').get(keepTodoId) as { brandId: string | null };
  assert.equal(kept.brandId, brandId, '品牌仍保留在库中时关联必须保留（旧实现只查本次导入映射会置空）');
  const dropped = db.prepare('SELECT brandId FROM todos WHERE content = ?')
    .get('关联不存在品牌的任务') as { brandId: string | null };
  assert.equal(dropped.brandId, null, '解析不到的品牌关联必须清除，而不是留下悬空 ID');
});

test('备份风险记录按账号留档、可手动忽略、无风险时自动清除', async () => {
  installBrowserStubs();
  try {
    const { saveBackupRisk, loadBackupRisk, clearBackupRisk } = await import('../src/lib/backupNotice.ts');

    localStorage.setItem('userId', 'user-a');
    saveBackupRisk(['集合 orders 超限'], 'export');
    assert.deepEqual(loadBackupRisk()?.warnings, ['集合 orders 超限']);
    assert.equal(loadBackupRisk()?.source, 'export');

    // 另一个账号不应看到上一个账号的备份风险
    localStorage.setItem('userId', 'user-b');
    assert.equal(loadBackupRisk(), null, '备份风险必须按账号隔离');

    localStorage.setItem('userId', 'user-a');
    saveBackupRisk(['WebDAV 上传的备份体积超限'], 'webdav');
    assert.equal(loadBackupRisk()?.source, 'webdav');
    assert.deepEqual(loadBackupRisk()?.warnings, ['WebDAV 上传的备份体积超限']);

    // 下一次没有风险时自动清除（避免展示过期风险）
    saveBackupRisk([], 'export');
    assert.equal(loadBackupRisk(), null);

    saveBackupRisk(['又一条风险'], 'export');
    clearBackupRisk();
    assert.equal(loadBackupRisk(), null, '用户忽略后不再展示');
  } finally {
    removeBrowserStubs();
  }
});

// ===== ⑥ 第六轮复核：同一件事的两条路径必须结果一致 + 性能/编码类修复 =====

/** 造一套"品牌 + 各类依赖记录"，用于对比手动路径与导入路径的结果 */
const seedBrandScenario = (brandId: string, brandName: string) => {
  db.prepare('INSERT INTO brands (id, userId, name, industry) VALUES (?, ?, ?, ?)')
    .run(brandId, primaryUserId, brandName, '数码');
  db.prepare('INSERT INTO orders (id, userId, orderNo, title, type, status, brandName) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), primaryUserId, 'NO-REF-1', '关联商单', 'paid', 'in_progress', brandName);
  db.prepare('INSERT INTO payments (id, userId, brand, amount, type) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), primaryUserId, brandName, 100, 'pending');
  db.prepare('INSERT INTO assets (id, userId, orderId, productName, brandName) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), primaryUserId, 'order-ref-x', '关联资产', brandName);
  db.prepare('INSERT INTO order_templates (id, userId, name, title, type, brandName) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), primaryUserId, '关联模板', '模板标题', 'paid', brandName);
  db.prepare('INSERT INTO todos (id, userId, content, category, brandId) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), primaryUserId, '关联待办', brandName, brandId);
};

/** 依赖记录快照：只比较"品牌关联"相关字段 */
const brandReferenceSnapshot = () => ({
  orders: db.prepare('SELECT brandName FROM orders WHERE userId = ? ORDER BY id').all(primaryUserId),
  payments: db.prepare('SELECT brand FROM payments WHERE userId = ? ORDER BY id').all(primaryUserId),
  assets: db.prepare('SELECT brandName FROM assets WHERE userId = ? ORDER BY id').all(primaryUserId),
  templates: db.prepare('SELECT brandName FROM order_templates WHERE userId = ? ORDER BY id').all(primaryUserId),
  todos: db.prepare('SELECT brandId, category FROM todos WHERE userId = ? ORDER BY id').all(primaryUserId),
});

test('品牌改名：导入路径与手动改名对依赖记录的结果一致（防两条实现漂移）', async () => {
  const brandId = uuidv4();

  // 路径一：界面上的手动改名
  seedBrandScenario(brandId, '旧名称');
  const manualResponse = await internalRequest(`/brands/${brandId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: '新名称' }),
  });
  assert.equal(manualResponse.status, 200);
  const manualSnapshot = brandReferenceSnapshot();

  // 路径二：导入同一 ID、改了名字的品牌
  resetDatabase();
  seedBrandScenario(brandId, '旧名称');
  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, brands: [{ id: brandId, name: '新名称', industry: '数码' }] }),
  });
  assert.equal(importResponse.status, 200);
  const importSnapshot = brandReferenceSnapshot();
  const importResult = await importResponse.json() as any;

  assert.deepEqual(
    importSnapshot,
    manualSnapshot,
    '导入改名后，商单/账单/资产/模板/待办分类必须与手动改名结果完全一致',
  );
  assert.equal(importResult.brandChanges?.renamed, 1, '响应必须报告 1 个品牌改名');

  // 预检必须提前说明会同步改名（用户明确反馈过"预检没有警告"）
  resetDatabase();
  seedBrandScenario(brandId, '旧名称');
  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, brands: [{ id: brandId, name: '新名称', industry: '数码' }] }),
  });
  const preview = await previewResponse.json() as any;
  assert.equal(preview.brandChanges?.renamed, 1, '预检必须预报改名');
  assert.ok(
    preview.warnings.some((warning: string) => warning.includes('改名')),
    '预检警告必须说明改名会同步依赖记录',
  );
});

test('品牌删除：导入路径与手动删除对依赖记录的结果一致', async () => {
  const brandId = uuidv4();

  // 路径一：界面上的手动删除
  seedBrandScenario(brandId, '待删品牌');
  const manualResponse = await internalRequest(`/brands/${brandId}`, { method: 'DELETE' });
  assert.equal(manualResponse.status, 200);
  const manualSnapshot = brandReferenceSnapshot();

  // 路径二：导入一份不含该品牌的备份
  resetDatabase();
  seedBrandScenario(brandId, '待删品牌');
  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify({ backupVersion: 4, brands: [], settings: { displayName: '仅设置' } }),
  });
  assert.equal(importResponse.status, 200);
  const importSnapshot = brandReferenceSnapshot();

  assert.deepEqual(
    importSnapshot,
    manualSnapshot,
    '品牌不再存在时，两条路径都必须清空依赖记录上的品牌标记并解除待办关联',
  );
});

test('待办恢复：品牌解析失败时分类一并清空（与预检承诺一致）', async () => {
  const payload = {
    backupVersion: 4,
    todos: [{ id: uuidv4(), content: '幽灵品牌待办', category: '幽灵品牌', brandId: 'ghost-brand-id' }],
  };

  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const preview = await previewResponse.json() as any;
  assert.ok(
    preview.warnings.some((warning: string) => warning.includes('分类同时清空')),
    '预检承诺了"分类同时清空"，就必须在导入时兑现',
  );

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(importResponse.status, 200);
  const todo = db.prepare('SELECT brandId, category FROM todos WHERE content = ?')
    .get('幽灵品牌待办') as { brandId: string | null; category: string | null };
  assert.equal(todo.brandId, null, '解析不到的品牌必须解除关联');
  assert.equal(todo.category, null, '分类必须与预检承诺一致地清空，不能留下"看似有品牌"的分类');
});

test('WebDAV 认证：用户名/密码含中文或 emoji 时仍可生成正确的 Basic 头', async () => {
  installBrowserStubs();
  try {
    const { getWebdavAuthorization } = await import('../src/lib/webdav.ts');
    const config = { url: 'https://dav.example.com/', username: '电脑用户', password: '密钥🔐', syncInterval: '0' };
    const header = getWebdavAuthorization(config);
    // 必须按 UTF-8 字节编码，而不是直接 btoa（后者对非 Latin-1 抛 InvalidCharacterError）
    const expected = `Basic ${Buffer.from(`电脑用户:密钥🔐`, 'utf8').toString('base64')}`;
    assert.equal(header, expected);

    // 解码回来必须与原文一致，保证服务端能解出正确凭据
    const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString('utf8');
    assert.equal(decoded, '电脑用户:密钥🔐');

    // 纯英文密码仍然保持原有行为
    assert.equal(
      getWebdavAuthorization({ ...config, username: 'user', password: 'pass' }),
      `Basic ${Buffer.from('user:pass', 'utf8').toString('base64')}`,
    );
  } finally {
    removeBrowserStubs();
  }
});

test('导入成功后刷新失败不得报告"导入失败"', async () => {
  installBrowserStubs();
  const originalFetch = globalThis.fetch;
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args.map(String).join(' ')); };

  // 导入成功，但其中一类列表（商单）刷新失败
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || 'GET').toUpperCase();
    if (url.includes('/api/data/import') && method === 'POST') {
      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/orders')) {
      return new Response(JSON.stringify({ error: '数据库忙' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('/api/settings')) {
      return new Response(JSON.stringify({ id: 's1', displayName: 'X' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;

  try {
    const { useStore } = await import('../src/store/useStore.ts');
    await assert.doesNotReject(
      () => useStore.getState().setAllData({ orders: [] }),
      '数据已经写入成功时，刷新失败不应把整个导入判定为失败（更不应抛出）',
    );
    const joined = warnings.join('\n');
    assert.ok(joined.includes('数据已导入成功'), `必须提示"已导入但刷新失败"，实际输出：${joined}`);
    assert.ok(!joined.includes('导入失败'), '不得再出现"数据导入失败"这类结论');
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    removeBrowserStubs();
  }
});

// ===== ⑦ 第七轮复核：多品牌改名不串改 / 无 ID 旧品牌保留同名关联 =====

/** 造一个品牌及其依赖记录，返回各行 id 以便逐条断言 */
const seedBrandWithReferences = (brandId: string, brandName: string) => {
  const ids = { brandId, orderId: uuidv4(), paymentId: uuidv4(), todoId: uuidv4(), templateId: uuidv4(), assetId: uuidv4() };
  db.prepare('INSERT INTO brands (id, userId, name, industry) VALUES (?, ?, ?, ?)')
    .run(brandId, primaryUserId, brandName, '数码');
  db.prepare('INSERT INTO orders (id, userId, orderNo, title, type, status, brandName) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ids.orderId, primaryUserId, `NO-${brandName}`, `商单-${brandName}`, 'paid', 'in_progress', brandName);
  db.prepare('INSERT INTO payments (id, userId, brand, amount, type) VALUES (?, ?, ?, ?, ?)')
    .run(ids.paymentId, primaryUserId, brandName, 100, 'pending');
  db.prepare('INSERT INTO todos (id, userId, content, category, brandId) VALUES (?, ?, ?, ?, ?)')
    .run(ids.todoId, primaryUserId, `待办-${brandName}`, brandName, brandId);
  db.prepare('INSERT INTO order_templates (id, userId, name, title, type, brandName) VALUES (?, ?, ?, ?, ?, ?)')
    .run(ids.templateId, primaryUserId, `模板-${brandName}`, '模板标题', 'paid', brandName);
  db.prepare('INSERT INTO assets (id, userId, orderId, productName, brandName) VALUES (?, ?, ?, ?, ?)')
    .run(ids.assetId, primaryUserId, 'order-x', `资产-${brandName}`, brandName);
  return ids;
};

const readBrandRefs = (ids: ReturnType<typeof seedBrandWithReferences>) => ({
  order: (db.prepare('SELECT brandName FROM orders WHERE id = ?').get(ids.orderId) as { brandName: string | null }).brandName,
  payment: (db.prepare('SELECT brand FROM payments WHERE id = ?').get(ids.paymentId) as { brand: string | null }).brand,
  todo: db.prepare('SELECT brandId, category FROM todos WHERE id = ?').get(ids.todoId) as { brandId: string | null; category: string | null },
  template: (db.prepare('SELECT brandName FROM order_templates WHERE id = ?').get(ids.templateId) as { brandName: string | null }).brandName,
  asset: (db.prepare('SELECT brandName FROM assets WHERE id = ?').get(ids.assetId) as { brandName: string | null }).brandName,
});

test('同时恢复两个互换名称的品牌：各品牌关联记录必须各自改名，不能串到一起', async () => {
  const brandA = uuidv4();
  const brandB = uuidv4();
  const refsA = seedBrandWithReferences(brandA, '甲');
  const refsB = seedBrandWithReferences(brandB, '乙');

  // 备份里两个品牌互换名称（ID 不变）
  const payload = {
    backupVersion: 4,
    brands: [
      { id: brandA, name: '乙', industry: '数码' },
      { id: brandB, name: '甲', industry: '家居' },
    ],
  };
  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(importResponse.status, 200);
  const result = await importResponse.json() as any;
  assert.equal(result.brandChanges.renamed, 2, '两个品牌都应记为改名');

  const afterA = readBrandRefs(refsA);
  const afterB = readBrandRefs(refsB);

  // 甲（brandA）的记录必须都变成"乙"，乙（brandB）的必须都变成"甲"
  assert.equal(afterA.order, '乙', '原「甲」的商单应改为「乙」');
  assert.equal(afterA.payment, '乙', '原「甲」的账单应改为「乙」');
  assert.equal(afterA.todo.category, '乙', '原「甲」的待办分类应改为「乙」');
  assert.equal(afterA.template, '乙', '原「甲」的模板应改为「乙」');
  assert.equal(afterA.asset, '乙', '原「甲」的资产应改为「乙」');

  assert.equal(afterB.order, '甲', '原「乙」的商单应改为「甲」');
  assert.equal(afterB.payment, '甲', '原「乙」的账单应改为「甲」');
  assert.equal(afterB.todo.category, '甲', '原「乙」的待办分类应改为「甲」');
  assert.equal(afterB.template, '甲', '原「乙」的模板应改为「甲」');
  assert.equal(afterB.asset, '甲', '原「乙」的资产应改为「甲」');

  // 待办的品牌 ID 仍各自指向自己的品牌
  assert.equal(afterA.todo.brandId, brandA, '待办的品牌关联不能串到另一个品牌');
  assert.equal(afterB.todo.brandId, brandB, '待办的品牌关联不能串到另一个品牌');

  // 品牌表本身也必须是互换后的名字（与行序无关地比较）
  const brandsNow = Object.fromEntries(
    (db.prepare('SELECT id, name FROM brands WHERE userId = ?').all(primaryUserId) as Array<{ id: string; name: string }>)
      .map(row => [row.id, row.name]),
  );
  assert.deepEqual(brandsNow, { [brandA]: '乙', [brandB]: '甲' });
});

test('恢复无 ID 的旧品牌：同名关联必须保留（重新指向新品牌）而不是被清空', async () => {
  const localBrandId = uuidv4();
  const refs = seedBrandWithReferences(localBrandId, '甲');

  // 旧格式备份：品牌只有名称、没有 ID
  const payload = { backupVersion: 4, brands: [{ name: '甲', industry: '数码' }] };

  const previewResponse = await internalRequest('/data/import/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const preview = await previewResponse.json() as any;
  assert.equal(preview.brandChanges.remapped, 1, '无 ID 的同名品牌应预报为"重新指向"');
  assert.equal(preview.brandChanges.removed, 0, '不能误报成"品牌不在备份中"');
  assert.equal(preview.orphans.todoBrands, 0, '不能误报待办解绑');

  const importResponse = await internalRequest('/data/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const result = await importResponse.json() as any;
  assert.equal(importResponse.status, 200);
  assert.equal(result.brandChanges.removed, 0, '同名旧品牌不应被当作删除');
  assert.equal(result.orphanedRelations.todoBrands, 0, '没有待办因此解绑');

  const brandsNow = db.prepare('SELECT id, name FROM brands WHERE userId = ?').all(primaryUserId) as Array<{ id: string; name: string }>;
  assert.equal(brandsNow.length, 1);
  const newBrandId = brandsNow[0].id;

  const after = readBrandRefs(refs);
  assert.equal(after.order, '甲', '商单品牌名必须保留');
  assert.equal(after.payment, '甲', '账单品牌必须保留');
  assert.equal(after.template, '甲', '模板品牌必须保留');
  assert.equal(after.asset, '甲', '资产品牌必须保留');
  assert.equal(after.todo.category, '甲', '待办分类必须保留');
  assert.equal(after.todo.brandId, newBrandId, '待办的品牌 ID 必须重新指向新建的同名品牌');
});


test('CSV 导出阻断公式起始文本并保留数值零', () => {
  assert.equal(csvCell('=1+1'), '"\t=1+1"');
  assert.equal(csvCell('  +SUM(A1:A2)'), '"\t  +SUM(A1:A2)"');
  assert.equal(csvCell('@cmd'), '"\t@cmd"');
  assert.equal(csvCell('-1+2'), '"\t-1+2"');
  assert.equal(csvCell(0), '"0"');
  assert.equal(csvCell('含"引号,逗号'), '"含""引号,逗号"');
});

test('备份预检和导入均拒绝规范化后重名的品牌', async () => {
  const payload = {
    backupVersion: 4,
    brands: [
      { id: uuidv4(), name: ' 重复品牌 ' },
      { id: uuidv4(), name: '重复品牌' },
    ],
  };
  for (const route of ['/data/import/preview', '/data/import']) {
    const response = await internalRequest(route, { method: 'POST', body: JSON.stringify(payload) });
    assert.equal(response.status, 400, route);
    const body = await response.json() as { error: string };
    assert.match(body.error, /品牌名称/);
  }
  const brands = await (await internalRequest('/brands')).json() as unknown[];
  assert.equal(brands.length, 0);
});

test('仪表盘近期待办按截止日期排序并排除已完成事项', async () => {
  const insert = db.prepare('INSERT INTO todos (id, userId, content, priority, completed, dueDate, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insert.run(uuidv4(), primaryUserId, '明天到期', 'high', 0, '2026-09-24', '2026-01-01');
  for (let i = 0; i < 6; i++) {
    insert.run(uuidv4(), primaryUserId, `明年到期 ${i}`, 'low', 0, '2027-09-24', '2026-09-23');
  }
  insert.run(uuidv4(), primaryUserId, '已完成', 'high', 1, '2026-09-22', '2026-09-23');
  insert.run(uuidv4(), secondaryUserId, '别人的待办', 'high', 0, '2026-09-20', '2026-09-23');
  const response = await internalRequest('/dashboard?year=2026&month=9');
  assert.equal(response.status, 200);
  const data = await response.json() as { recentTodos: Array<{ content: string }> };
  assert.equal(data.recentTodos.length, 6);
  assert.equal(data.recentTodos[0].content, '明天到期');
  assert.ok(data.recentTodos.every(todo => todo.content !== '已完成' && todo.content !== '别人的待办'));
});

test('仪表盘按账号汇总，近期列表有上限且提醒只返回到期记录', async () => {
  for (let index = 0; index < 8; index++) {
    const response = await internalRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({
        title: `测试商单 ${index}`,
        type: 'paid',
        status: 'in_progress',
        actualAmount: 100,
        acceptDate: '2026-09-01',
        submitDate: index === 0 ? '2026-09-24' : '2026-12-01',
      }),
    });
    assert.equal(response.status, 200);
  }
  db.prepare("INSERT INTO payments (id, userId, brand, amount, type, date, settledDate) VALUES (?, ?, ?, ?, 'settled', ?, ?)")
    .run(uuidv4(), primaryUserId, '甲', 30, '2026-09-04', '2026-09-04');
  db.prepare("INSERT INTO payments (id, userId, brand, amount, type, date, settledDate) VALUES (?, ?, ?, ?, 'settled', ?, ?)")
    .run(uuidv4(), primaryUserId, '甲', 7, '2026-08-04', '2026-08-04');
  db.prepare("INSERT INTO payments (id, userId, brand, amount, type, date, settledDate) VALUES (?, ?, ?, ?, 'settled', ?, ?)")
    .run(uuidv4(), secondaryUserId, '乙', 999, '2026-09-04', '2026-09-04');
  db.prepare("INSERT INTO payments (id, userId, brand, amount, type, date, dueDate) VALUES (?, ?, ?, ?, 'pending', ?, ?)")
    .run(uuidv4(), primaryUserId, '甲', 12, '2026-09-20', '2026-09-20');
  const response = await internalRequest('/dashboard?year=2026&month=9');
  assert.equal(response.status, 200);
  const data = await response.json() as any;
  assert.equal(data.monthlyIncome, 30);
  assert.equal(data.lastMonthIncome, 7);
  assert.equal(data.pendingOrders, 8);
  assert.equal(data.newOrdersThisMonth, 8);
  assert.equal(data.recentOrders.length, 5);
  assert.equal(data.recentTodos.length, 6);
  assert.equal(data.monthlyStats[8].income, 30);
  const candidatesResponse = await internalRequest('/dashboard/notification-candidates?today=2026-09-23');
  assert.equal(candidatesResponse.status, 200);
  const candidates = await candidatesResponse.json() as { orders: unknown[]; payments: unknown[] };
  assert.equal(candidates.orders.length, 1);
  assert.equal(candidates.payments.length, 1);
  assert.equal((await internalRequest('/dashboard/notification-candidates?today=2026-99-99')).status, 400);
});

test('品牌改名与删除会立即同步前端商单品牌名', async () => {
  const created = await internalRequest('/brands', { method: 'POST', body: JSON.stringify({ name: '原品牌' }) });
  assert.equal(created.status, 200);
  const brand = await created.json() as { id: string; name: string };
  const nativeFetch = globalThis.fetch;
  const storage = new Map<string, string>([['token', token]]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: new URL(baseUrl) } });
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    return nativeFetch(new URL(rawUrl, baseUrl), init);
  };
  try {
    const { useStore } = await import('../src/store/useStore.ts');
    useStore.setState({ brands: [brand as any], orders: [{ id: 'o1', brandName: '原品牌' } as any] });
    await useStore.getState().updateBrand(brand.id, { name: '新品牌' });
    assert.equal(useStore.getState().orders[0].brandName, '新品牌');
    await useStore.getState().deleteBrand(brand.id);
    assert.equal(useStore.getState().orders[0].brandName, '');
  } finally {
    globalThis.fetch = nativeFetch;
    removeBrowserStubs();
  }
});
