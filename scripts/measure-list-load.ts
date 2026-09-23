/**
 * 列表读取开销实测：衡量"主列表全量读取"在当前实现下的真实开销
 * （服务端 SQL + JSON 序列化、网络传输体积、前端解析与聚合）。
 *
 * 用法：npx tsx scripts/measure-list-load.ts
 * 数据落在 test-results/loadtest-data（可安全删除），不会碰正式数据目录。
 *
 * 用途：评估"页面级分页/服务端聚合"改造的收益与验收标准（例如首屏传输体积目标）。
 */
// 一次性压测数据目录（跑完可删）：npx tsx scripts/measure-list-load.ts
process.env.DATA_DIR = process.env.LOADTEST_DATA_DIR || 'test-results/loadtest-data';
process.env.JWT_SECRET = 'kolflow-loadtest-secret';
process.env.NODE_ENV = 'test';

import express from 'express';
import { gzipSync } from 'node:zlib';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const { v4: uuidv4 } = await import('uuid');
const { default: db } = await import('../src/server/db.js');
const apiRoutes = (await import('../src/server/api.js')).default;
const { generateToken } = await import('../src/server/routes/utils/index.js');

const userId = uuidv4();
db.prepare('INSERT INTO users (id, email, password, displayName) VALUES (?, ?, ?, ?)')
  .run(userId, 'load@example.com', 'x', '压测账号');
db.prepare('INSERT INTO settings (id, userId, displayName, email, apiKey) VALUES (?, ?, ?, ?, ?)')
  .run(uuidv4(), userId, '压测账号', 'load@example.com', 'load-key');
const token = generateToken(userId, 'load@example.com');

const seed = (table: string, count: number, build: (index: number) => unknown[]) => {
  const columns: Record<string, string> = {
    orders: 'id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue, createdAt',
    payments: 'id, userId, orderNo, brand, amount, type, date, dueDate, method, createdAt',
    todos: 'id, userId, content, priority, category, completed, dueDate, createdAt',
    assets: 'id, userId, orderId, orderNo, brandName, productName, productValue, saleStatus, soldAmount, soldDate, createdAt',
    activity_logs: 'id, userId, action, entityType, entityId, details, createdAt',
  };
  const placeholders = `(${columns[table].split(',').map(() => '?').join(', ')})`;
  const statement = db.prepare(`INSERT INTO ${table} (${columns[table]}) VALUES ${placeholders}`);
  const insertMany = db.transaction((rows: unknown[][]) => {
    for (const row of rows) statement.run(...(row as never[]));
  });
  const rows: unknown[][] = [];
  for (let index = 0; index < count; index += 1) rows.push(build(index));
  insertMany(rows);
};

const app = express();
app.use(express.json({ limit: '100mb' }));
app.use('/api', apiRoutes);
const server: Server = await new Promise(resolve => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const measure = async (path: string, expectedRows: number) => {
  const samples: number[] = [];
  let bytes = 0;
  let rows = 0;
  for (let round = 0; round < 5; round += 1) {
    const started = performance.now();
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await response.text();
    samples.push(performance.now() - started);
    bytes = Buffer.byteLength(text, 'utf8');
    rows = JSON.parse(text).length;
  }
  samples.sort((a, b) => a - b);

  // 客户端侧成本：JSON.parse + 一次典型聚合（sum）+ 一次筛选（等价于页面里的 filter/reduce）
  const text = await (await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })).text();
  const clientStarted = performance.now();
  const parsed = JSON.parse(text) as Array<Record<string, number>>;
  const parsedAt = performance.now();
  const total = parsed.reduce((sum, row) => sum + (Number(row.amount ?? row.actualAmount ?? row.productValue) || 0), 0);
  const filtered = parsed.filter(row => Number(row.amount ?? row.actualAmount ?? 1) > 0);
  const clientMs = performance.now() - clientStarted;

  return {
    path,
    rows: rows || expectedRows,
    decodedBytes: bytes,
    gzipBytes: gzipSync(text).length,
    serverMs: Number(samples[2].toFixed(1)),
    clientParseMs: Number((parsedAt - clientStarted).toFixed(1)),
    clientAggregateMs: Number((parsedAt - clientStarted + (performance.now() - parsedAt)).toFixed(1)),
    clientTotalMs: Number(clientMs.toFixed(1)),
    filtered: filtered.length,
    total: Math.round(total),
  };
};

const report: Array<Record<string, unknown>> = [];
const printRow = (r: Record<string, unknown>) => {
  console.log(
    String(r.path).padEnd(26),
    `${String(r.rows).padStart(7)} 行`,
    `${(Number(r.gzipBytes) / 1024 / 1024).toFixed(2).padStart(6)} MB gzip预估`,
    `${(Number(r.decodedBytes) / 1024 / 1024).toFixed(2).padStart(6)} MB JSON`,
    `服务端 ${String(r.serverMs).padStart(7)} ms`,
    `前端解析 ${String(r.clientParseMs).padStart(6)} ms`,
    `前端解析+聚合 ${String(r.clientTotalMs).padStart(7)} ms`,
  );
};

console.log('规模            数据量       gzip预估    解压后JSON    服务端耗时        前端耗时拆解');

seed('orders', 1000, index => [uuidv4(), userId, `NO-${index}`, `商单 ${index}`, 'paid', 'completed', 1000, 1000 + index, `品牌${index % 50}`, '["小红书","抖音"]', '2026-01-01', '2026-01-02', '产品', 500, new Date().toISOString()]);
report.push(await measure('/api/orders', 1000));
printRow(report.at(-1)!);

seed('orders', 4000, index => [uuidv4(), userId, `NO-B-${index}`, `补充商单 ${index}`, 'paid', 'completed', 1000, 1000 + index, `品牌${index % 50}`, '["小红书"]', '2026-02-01', '2026-02-02', '产品', 500, new Date().toISOString()]);
seed('payments', 5000, index => [uuidv4(), userId, `NO-P-${index}`, `品牌${index % 50}`, 100 + index, index % 2 ? 'settled' : 'pending', '2026-02-01', '2026-02-01', '待结算', new Date().toISOString()]);
seed('todos', 5000, index => [uuidv4(), userId, `待办 ${index}`, 'medium', `品牌${index % 50}`, index % 3 === 0 ? 1 : 0, '2026-03-01', new Date().toISOString()]);
seed('assets', 5000, index => [uuidv4(), userId, uuidv4(), `NO-A-${index}`, `品牌${index % 50}`, `资产 ${index}`, 300, index % 4 === 0 ? 'sold' : 'keep', index % 4 === 0 ? 200 : 0, '2026-02-10', new Date().toISOString()]);
seed('activity_logs', 50000, index => [uuidv4(), userId, 'update', 'order', `entity-${index}`, `日志 ${index}`, new Date().toISOString()]);
report.push(await measure('/api/orders', 5000));
printRow(report.at(-1)!);
report.push(await measure('/api/payments', 5000));
printRow(report.at(-1)!);
report.push(await measure('/api/todos', 5000));
printRow(report.at(-1)!);
report.push(await measure('/api/assets', 5000));
printRow(report.at(-1)!);
report.push(await measure('/api/logs?limit=100&offset=0', 100));
printRow(report.at(-1)!);

seed('orders', 15000, index => [uuidv4(), userId, `NO-C-${index}`, `大单 ${index}`, 'paid', 'completed', 1000, 1000 + index, `品牌${index % 50}`, '["小红书","抖音","B站"]', '2026-03-01', '2026-03-02', '产品', 500, new Date().toISOString()]);
report.push(await measure('/api/orders', 20000));
printRow(report.at(-1)!);

const exportStarted = performance.now();
const exportResponse = await fetch(`${base}/api/data/export`, { headers: { Authorization: `Bearer ${token}` } });
const exportText = await exportResponse.text();
console.log(
  '\n完整导出（备份）        ',
  `${Buffer.byteLength(exportText, 'utf8') / 1024 / 1024} MB`,
  `耗时 ${(performance.now() - exportStarted).toFixed(0)} ms`,
  `（exportWarnings=${JSON.stringify((JSON.parse(exportText) as { exportWarnings?: string[] }).exportWarnings ?? [])}）`,
);

server.close();
db.close();
