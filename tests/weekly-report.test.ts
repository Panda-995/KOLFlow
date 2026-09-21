import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  buildBusinessNotifications,
  parseReportPayload,
} from '../src/lib/notifications.ts';
import {
  buildReportAnalyticsLink,
  isDateInReportPeriod,
  parseReportPeriod,
} from '../src/lib/reportPeriod.ts';

const testDataDir = mkdtempSync(join(tmpdir(), 'kolflow-weekly-report-'));
process.env.DATA_DIR = testDataDir;
process.env.JWT_SECRET = 'kolflow-weekly-report-test-secret';
process.env.NODE_ENV = 'test';

let db: typeof import('../src/server/db.ts').default;
let server: Server;
let baseUrl: string;
let generateToken: typeof import('../src/server/routes/utils/index.ts').generateToken;
const userId = uuidv4();
const otherUserId = uuidv4();

const internalRequest = (path: string) => fetch(`${baseUrl}/api${path}`, {
  headers: { Authorization: `Bearer ${generateToken(userId, 'weekly@example.com')}` },
});

before(async () => {
  db = (await import('../src/server/db.ts')).default;
  const apiRoutes = (await import('../src/server/api.ts')).default;
  ({ generateToken } = await import('../src/server/routes/utils/index.ts'));

  const app = express();
  app.use(express.json());
  app.use('/api', apiRoutes);
  await new Promise<void>(resolve => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  db.pragma('foreign_keys = OFF');
  for (const table of ['paid_promotions', 'assets', 'payments', 'orders', 'settings', 'users']) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
  db.pragma('foreign_keys = ON');

  db.prepare('INSERT INTO users (id, email, password) VALUES (?, ?, ?)')
    .run(userId, 'weekly@example.com', 'unused');
  db.prepare('INSERT INTO users (id, email, password) VALUES (?, ?, ?)')
    .run(otherUserId, 'other-weekly@example.com', 'unused');
  db.prepare('INSERT INTO settings (id, userId, weeklyReport, reportFrequency) VALUES (?, ?, 1, ?)')
    .run(uuidv4(), userId, 'weekly');
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  db.close();
  rmSync(testDataDir, { recursive: true, force: true });
});

test('周期报告接口返回上一整周的汇总并隔离其他周期和用户', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-21T02:00:00Z') });
  const dates = { start: '2026-09-14', end: '2026-09-20', before: '2026-09-13' };
  const orderId = uuidv4();
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status, acceptDate, brandName)
    VALUES (?, ?, ?, ?, 'paid', 'completed', ?, ?)
  `).run(orderId, userId, `ORD-${uuidv4()}`, '本周商单', dates.start, '本周品牌');
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status, acceptDate)
    VALUES (?, ?, ?, ?, 'paid', 'completed', ?)
  `).run(uuidv4(), userId, `ORD-${uuidv4()}`, '上周商单', dates.before);
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status, acceptDate)
    VALUES (?, ?, ?, ?, 'paid', 'completed', ?)
  `).run(uuidv4(), otherUserId, `ORD-${uuidv4()}`, '其他用户商单', dates.start);
  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status, acceptDate)
    VALUES (?, ?, ?, ?, 'paid', 'completed', ?)
  `).run(uuidv4(), userId, `ORD-${uuidv4()}`, '本周尚未结算的商单', '2026-09-21');

  db.prepare(`
    INSERT INTO payments (id, userId, brand, amount, type, date, settledDate)
    VALUES (?, ?, ?, 300, 'settled', ?, ?)
  `).run(uuidv4(), userId, '本周品牌', dates.start, dates.start);
  db.prepare(`
    INSERT INTO payments (id, userId, brand, amount, type, date, dueDate)
    VALUES (?, ?, ?, 100, 'pending', ?, ?)
  `).run(uuidv4(), userId, '本周品牌', dates.start, dates.start);
  db.prepare(`
    INSERT INTO assets (id, userId, orderId, productName, saleStatus, soldAmount, soldDate)
    VALUES (?, ?, ?, ?, 'sold', 50, ?)
  `).run(uuidv4(), userId, orderId, '本周资产', dates.start);
  db.prepare(`
    INSERT INTO paid_promotions (id, orderId, userId, platform, amount)
    VALUES (?, ?, ?, '小红书', 20)
  `).run(uuidv4(), orderId, userId);

  const response = await internalRequest('/report/weekly');
  assert.equal(response.status, 200);
  const report = await response.json() as any;
  assert.deepEqual(report.period, { start: dates.start, end: dates.end, type: 'weekly' });
  assert.deepEqual(report.summary, {
    totalOrders: 1,
    completedOrders: 1,
    totalIncome: 350,
    pendingIncome: 100,
    paidPromotionTotal: 20,
  });
});

for (const [instant, type, start, end] of [
  ['2026-09-20T15:59:59Z', 'weekly', '2026-09-07', '2026-09-13'],
  ['2026-09-20T16:00:00Z', 'weekly', '2026-09-14', '2026-09-20'],
  ['2026-09-23T04:00:00Z', 'weekly', '2026-09-14', '2026-09-20'],
  ['2026-01-04T16:00:00Z', 'weekly', '2025-12-29', '2026-01-04'],
  ['2026-09-30T15:59:59Z', 'monthly', '2026-08-01', '2026-08-31'],
  ['2026-09-30T16:00:00Z', 'monthly', '2026-09-01', '2026-09-30'],
  ['2026-01-01T00:00:00Z', 'monthly', '2025-12-01', '2025-12-31'],
  ['2024-03-01T00:00:00Z', 'monthly', '2024-02-01', '2024-02-29'],
]) {
  test(`${type} 在北京时间 ${instant} 返回上个完整周期`, async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date(instant) });
    const response = await internalRequest(`/report/${type}`);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as any).period, { type, start, end });
  });
}

test('报告通知展示周期和关键指标，并把精确日期写入统计链接', () => {
  const parsed = parseReportPayload({
    period: { start: '2030-01-01', end: '2030-01-07', type: 'weekly' },
    summary: {
      totalOrders: 2,
      completedOrders: 1,
      totalIncome: 300,
      pendingIncome: 100,
      paidPromotionTotal: 20,
    },
  });
  assert.ok(parsed);

  const notifications = buildBusinessNotifications({
    now: new Date(2030, 0, 7, 12),
    orders: [],
    payments: [],
    settings: { id: 'settings-1', orderReminder: false, weeklyReport: true, reportFrequency: 'weekly' } as any,
    dismissedIds: [],
    reportSummary: parsed.summary,
    reportPeriod: parsed.period,
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, '上周数据汇总已生成');
  assert.match(notifications[0].message, /2030-01-01 至 2030-01-07/);
  assert.match(notifications[0].message, /1\/2 个商单已完成/);
  assert.match(notifications[0].message, /推广费 ¥20/);

  const url = new URL(notifications[0].link, 'https://kolflow.local');
  assert.equal(url.pathname, '/analytics');
  assert.equal(url.searchParams.get('period'), 'weekly');
  assert.equal(url.searchParams.get('start'), '2030-01-01');
  assert.equal(url.searchParams.get('end'), '2030-01-07');
  assert.ok(parsed.period);
  assert.equal(notifications[0].link, buildReportAnalyticsLink(parsed.period));
});

test('报告已读标识绑定实际报告周期，浏览器跨周不改变旧报告标识', () => {
  const input = {
    orders: [], payments: [], dismissedIds: [],
    settings: { id: 'settings-1', orderReminder: false, weeklyReport: true } as any,
    reportSummary: { totalOrders: 0, completedOrders: 0, totalIncome: 0, pendingIncome: 0 },
    reportPeriod: { type: 'weekly' as const, start: '2026-09-14', end: '2026-09-20' },
  };
  const old = buildBusinessNotifications({ ...input, now: new Date('2026-09-21T00:00:00Z') })[0];
  const later = buildBusinessNotifications({ ...input, now: new Date('2026-09-28T00:00:00Z') })[0];
  assert.equal(old.id, later.id);
  assert.equal(buildBusinessNotifications({ ...input, now: new Date(), dismissedIds: [old.id] }).length, 0);
  const next = buildBusinessNotifications({ ...input, now: new Date(), dismissedIds: [old.id],
    reportPeriod: { type: 'weekly', start: '2026-09-21', end: '2026-09-27' },
  });
  assert.equal(next.length, 1);
});

test('统计页周期参数只接受有效日期范围并精确匹配日期', () => {
  const period = parseReportPeriod('?period=weekly&start=2030-01-01&end=2030-01-07');
  assert.deepEqual(period, { type: 'weekly', start: '2030-01-01', end: '2030-01-07' });
  assert.equal(isDateInReportPeriod('2030-01-01', period), true);
  assert.equal(isDateInReportPeriod('2030-01-07T23:59:59.000Z', period), true);
  assert.equal(isDateInReportPeriod('2030-01-08', period), false);
  assert.equal(parseReportPeriod('?period=weekly&start=2030-01-08&end=2030-01-07'), null);
  assert.equal(parseReportPeriod('?period=yearly&start=2030-01-01&end=2030-01-07'), null);
});

test('报告接口失败时生成可重试的明确通知，而不是静默空白', () => {
  const notifications = buildBusinessNotifications({
    now: new Date(2030, 0, 7, 12),
    orders: [],
    payments: [],
    settings: { id: 'settings-1', orderReminder: false, weeklyReport: true, reportFrequency: 'weekly' } as any,
    dismissedIds: [],
    reportError: true,
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].action, 'retry-report');
  assert.match(notifications[0].message, /点击重试/);
});
