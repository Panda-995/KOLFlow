import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new Database(dbPath);

const assetColumns = db.prepare("PRAGMA table_info(assets)").all() as any[];
const assetColumnNames = assetColumns.map((c: any) => c.name);
if (!assetColumnNames.includes('saleStatus')) {
  db.exec("ALTER TABLE assets ADD COLUMN saleStatus TEXT DEFAULT 'keep';");
}
if (!assetColumnNames.includes('soldAmount')) {
  db.exec('ALTER TABLE assets ADD COLUMN soldAmount REAL DEFAULT 0;');
}
if (!assetColumnNames.includes('soldDate')) {
  db.exec('ALTER TABLE assets ADD COLUMN soldDate TEXT;');
}

const TARGET_EMAIL = 'a676096193@gmail.com';

const user = db.prepare('SELECT * FROM users WHERE email = ?').get(TARGET_EMAIL) as any;
if (!user) {
  console.error(`用户 ${TARGET_EMAIL} 不存在`);
  process.exit(1);
}

const userId = user.id;
console.log(`找到用户: ${user.email} (ID: ${userId})`);

db.pragma('foreign_keys = OFF');

const tables = ['comments', 'publish_links', 'activity_logs', 'todos', 'assets', 'payments', 'orders', 'brands'];
for (const table of tables) {
  const result = db.prepare(`DELETE FROM ${table} WHERE userId = ?`).run(userId);
  console.log(`清空 ${table}: ${result.changes} 条记录`);
}

db.pragma('foreign_keys = ON');

console.log('\n开始创建测试数据...\n');

const now = new Date();
const thisYear = now.getFullYear().toString();
const thisMonth = (now.getMonth() + 1).toString().padStart(2, '0');
const lastMonth = (now.getMonth() === 0 ? 12 : now.getMonth()).toString().padStart(2, '0');
const twoMonthsAgo = (now.getMonth() <= 1 ? 12 + now.getMonth() - 1 : now.getMonth() - 1).toString().padStart(2, '0');
const lastMonthYear = now.getMonth() === 0 ? (now.getFullYear() - 1).toString() : thisYear;
const twoMonthsAgoYear = now.getMonth() <= 1 ? (now.getFullYear() - 1).toString() : thisYear;

const brandData = [
  { id: uuidv4(), name: '华为', industry: '科技', contact: '张经理', phone: '13800001001', contacts: JSON.stringify([{ id: uuidv4(), name: '张经理', phone: '13800001001', note: '主要负责手机产品线' }]) },
  { id: uuidv4(), name: '小米', industry: '科技', contact: '李经理', phone: '13800001002', contacts: JSON.stringify([{ id: uuidv4(), name: '李经理', phone: '13800001002', note: '汽车和手机业务' }]) },
  { id: uuidv4(), name: '耐克', industry: '运动', contact: '王经理', phone: '13800001003', contacts: JSON.stringify([{ id: uuidv4(), name: '王经理', phone: '13800001003', note: '运动鞋服线' }]) },
  { id: uuidv4(), name: '欧莱雅', industry: '美妆', contact: '赵经理', phone: '13800001004', contacts: JSON.stringify([{ id: uuidv4(), name: '赵经理', phone: '13800001004', note: '护肤品类' }]) },
  { id: uuidv4(), name: '奔驰', industry: '汽车', contact: '陈经理', phone: '13800001005', contacts: JSON.stringify([{ id: uuidv4(), name: '陈经理', phone: '13800001005', note: '新车发布合作' }]) },
];

const insertBrand = db.prepare(`
  INSERT INTO brands (id, userId, name, industry, contact, phone, contacts, totalOrders, totalIncome, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const b of brandData) {
  insertBrand.run(b.id, userId, b.name, b.industry, b.contact, b.phone, b.contacts, 0, 0, new Date().toISOString());
}
console.log(`创建 ${brandData.length} 个品牌`);

const orderData = [
  {
    id: uuidv4(), orderNo: `ORD-${thisYear}${thisMonth}10-120000-a1b2c3`, title: '华为Mate70 Pro测评', type: 'paid', status: 'completed',
    expectedAmount: 15000, actualAmount: 15000, brandName: '华为', platforms: JSON.stringify(['抖音', 'B站', '小红书']),
    acceptDate: `${thisYear}-${thisMonth}-05`, submitDate: `${thisYear}-${thisMonth}-12`, productName: '', productValue: 0,
    createdAt: `${thisYear}-${thisMonth}-05T10:00:00.000Z`
  },
  {
    id: uuidv4(), orderNo: `ORD-${lastMonthYear}${lastMonth}15-120000-d4e5f6`, title: '小米SU7试驾体验', type: 'paid', status: 'completed',
    expectedAmount: 20000, actualAmount: 20000, brandName: '小米', platforms: JSON.stringify(['抖音', '微博', '视频号']),
    acceptDate: `${lastMonthYear}-${lastMonth}-10`, submitDate: `${lastMonthYear}-${lastMonth}-18`, productName: '', productValue: 0,
    createdAt: `${lastMonthYear}-${lastMonth}-10T09:00:00.000Z`
  },
  {
    id: uuidv4(), orderNo: `ORD-${thisYear}${thisMonth}08-120000-g7h8i9`, title: '耐克AirMax Dn8推广', type: 'product_exchange', status: 'completed',
    expectedAmount: 0, actualAmount: 0, brandName: '耐克', platforms: JSON.stringify(['抖音', '小红书']),
    acceptDate: `${thisYear}-${thisMonth}-01`, submitDate: `${thisYear}-${thisMonth}-10`, productName: 'AirMax Dn8', productValue: 3000,
    createdAt: `${thisYear}-${thisMonth}-01T08:00:00.000Z`
  },
  {
    id: uuidv4(), orderNo: `ORD-${thisYear}${thisMonth}12-120000-j1k2l3`, title: '欧莱雅玻尿酸精华推广', type: 'paid', status: 'in_progress',
    expectedAmount: 8000, actualAmount: 8000, brandName: '欧莱雅', platforms: JSON.stringify(['抖音', '小红书']),
    acceptDate: `${thisYear}-${thisMonth}-08`, submitDate: `${thisYear}-${thisMonth}-20`, productName: '', productValue: 0,
    createdAt: `${thisYear}-${thisMonth}-08T11:00:00.000Z`
  },
  {
    id: uuidv4(), orderNo: `ORD-${twoMonthsAgoYear}${twoMonthsAgo}20-120000-m4n5o6`, title: '奔驰EQS新车发布', type: 'paid', status: 'completed',
    expectedAmount: 50000, actualAmount: 50000, brandName: '奔驰', platforms: JSON.stringify(['抖音', 'B站', '微博', '视频号']),
    acceptDate: `${twoMonthsAgoYear}-${twoMonthsAgo}-05`, submitDate: `${twoMonthsAgoYear}-${twoMonthsAgo}-15`, productName: '', productValue: 0,
    createdAt: `${twoMonthsAgoYear}-${twoMonthsAgo}-05T07:00:00.000Z`
  },
  {
    id: uuidv4(), orderNo: `ORD-${lastMonthYear}${lastMonth}22-120000-p7q8r9`, title: '华为MatePad Pro测评', type: 'ecard', status: 'completed',
    expectedAmount: 0, actualAmount: 0, brandName: '华为', platforms: JSON.stringify(['B站', '小红书']),
    acceptDate: `${lastMonthYear}-${lastMonth}-15`, submitDate: `${lastMonthYear}-${lastMonth}-22`, productName: '华为 E卡', productValue: 2000,
    createdAt: `${lastMonthYear}-${lastMonth}-15T10:00:00.000Z`
  },
  {
    id: uuidv4(), orderNo: `ORD-${thisYear}${thisMonth}15-120000-s1t2u3`, title: '小米15 Ultra测评', type: 'paid', status: 'completed',
    expectedAmount: 12000, actualAmount: 12000, brandName: '小米', platforms: JSON.stringify(['抖音', 'B站']),
    acceptDate: `${thisYear}-${thisMonth}-10`, submitDate: `${thisYear}-${thisMonth}-18`, productName: '', productValue: 0,
    createdAt: `${thisYear}-${thisMonth}-10T09:30:00.000Z`
  },
  {
    id: uuidv4(), orderNo: `ORD-${thisYear}${thisMonth}18-120000-v4w5x6`, title: '耐克运动服饰春季系列', type: 'product_exchange', status: 'in_progress',
    expectedAmount: 0, actualAmount: 0, brandName: '耐克', platforms: JSON.stringify(['抖音', '小红书', '微博']),
    acceptDate: `${thisYear}-${thisMonth}-12`, submitDate: `${thisYear}-${thisMonth}-25`, productName: '春季运动套装', productValue: 5000,
    createdAt: `${thisYear}-${thisMonth}-12T14:00:00.000Z`
  },
];

const insertOrder = db.prepare(`
  INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const o of orderData) {
  insertOrder.run(o.id, userId, o.orderNo, o.title, o.type, o.status, o.expectedAmount, o.actualAmount, o.brandName, o.platforms, o.acceptDate, o.submitDate, o.productName, o.productValue, o.createdAt);
}
console.log(`创建 ${orderData.length} 个商单`);

const paymentData = [
  { id: uuidv4(), orderNo: orderData[0].orderNo, brand: '华为', amount: 15000, type: 'settled', date: `${thisYear}-${thisMonth}-12`, method: '银行转账', createdAt: `${thisYear}-${thisMonth}-12T10:00:00.000Z` },
  { id: uuidv4(), orderNo: orderData[1].orderNo, brand: '小米', amount: 20000, type: 'settled', date: `${lastMonthYear}-${lastMonth}-20`, method: '银行转账', createdAt: `${lastMonthYear}-${lastMonth}-20T10:00:00.000Z` },
  { id: uuidv4(), orderNo: orderData[4].orderNo, brand: '奔驰', amount: 50000, type: 'settled', date: `${twoMonthsAgoYear}-${twoMonthsAgo}-18`, method: '银行转账', createdAt: `${twoMonthsAgoYear}-${twoMonthsAgo}-18T10:00:00.000Z` },
  { id: uuidv4(), orderNo: orderData[6].orderNo, brand: '小米', amount: 12000, type: 'pending', date: `${thisYear}-${thisMonth}-15`, method: '支付宝', createdAt: `${thisYear}-${thisMonth}-15T10:00:00.000Z` },
  { id: uuidv4(), orderNo: orderData[3].orderNo, brand: '欧莱雅', amount: 8000, type: 'pending', date: `${thisYear}-${thisMonth}-10`, method: '微信', createdAt: `${thisYear}-${thisMonth}-10T10:00:00.000Z` },
];

const insertPayment = db.prepare(`
  INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, method, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const p of paymentData) {
  insertPayment.run(p.id, userId, p.orderNo, p.brand, p.amount, p.type, p.date, p.method, p.createdAt);
}
console.log(`创建 ${paymentData.length} 条账单`);

const assetData = [
  {
    id: uuidv4(), orderId: orderData[2].id, orderNo: orderData[2].orderNo, brandName: '耐克',
    productName: 'AirMax Dn8', productValue: 3000, image: null,
    saleStatus: 'sold', soldAmount: 2800, soldDate: `${thisYear}-${thisMonth}-12`,
    createdAt: `${thisYear}-${thisMonth}-10T10:00:00.000Z`
  },
  {
    id: uuidv4(), orderId: orderData[5].id, orderNo: orderData[5].orderNo, brandName: '华为',
    productName: '华为 E卡', productValue: 2000, image: null,
    saleStatus: 'sold', soldAmount: 1800, soldDate: `${lastMonthYear}-${lastMonth}-25`,
    createdAt: `${lastMonthYear}-${lastMonth}-22T10:00:00.000Z`
  },
  {
    id: uuidv4(), orderId: orderData[7].id, orderNo: orderData[7].orderNo, brandName: '耐克',
    productName: '春季运动套装', productValue: 5000, image: null,
    saleStatus: 'keep', soldAmount: 0, soldDate: null,
    createdAt: `${thisYear}-${thisMonth}-12T14:00:00.000Z`
  },
];

const insertAsset = db.prepare(`
  INSERT INTO assets (id, userId, orderId, orderNo, brandName, productName, productValue, image, saleStatus, soldAmount, soldDate, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const a of assetData) {
  insertAsset.run(a.id, userId, a.orderId, a.orderNo, a.brandName, a.productName, a.productValue, a.image, a.saleStatus, a.soldAmount, a.soldDate, a.createdAt);
}
console.log(`创建 ${assetData.length} 个资产`);

const todoData = [
  { id: uuidv4(), content: '完成华为Mate70 Pro测评报告', priority: 'high', category: '华为', completed: 0, dueDate: `${thisYear}-${thisMonth}-20`, orderId: orderData[0].id, brandId: brandData[0].id, createdAt: `${thisYear}-${thisMonth}-05T10:00:00.000Z` },
  { id: uuidv4(), content: '跟进小米SU7合作续约', priority: 'medium', category: '小米', completed: 0, dueDate: `${thisYear}-${thisMonth}-18`, orderId: orderData[1].id, brandId: brandData[1].id, createdAt: `${lastMonthYear}-${lastMonth}-10T09:00:00.000Z` },
  { id: uuidv4(), content: '准备奔驰EQS新车发布内容', priority: 'high', category: '奔驰', completed: 1, dueDate: `${twoMonthsAgoYear}-${twoMonthsAgo}-10`, orderId: orderData[4].id, brandId: brandData[4].id, createdAt: `${twoMonthsAgoYear}-${twoMonthsAgo}-05T07:00:00.000Z` },
  { id: uuidv4(), content: '联系欧莱雅确认推广档期', priority: 'medium', category: '欧莱雅', completed: 0, dueDate: `${thisYear}-${thisMonth}-22`, orderId: orderData[3].id, brandId: brandData[3].id, createdAt: `${thisYear}-${thisMonth}-08T11:00:00.000Z` },
  { id: uuidv4(), content: '耐克AirMax素材整理与后期', priority: 'low', category: '耐克', completed: 0, dueDate: `${thisYear}-${thisMonth}-25`, orderId: orderData[2].id, brandId: brandData[2].id, createdAt: `${thisYear}-${thisMonth}-01T08:00:00.000Z` },
  { id: uuidv4(), content: '整理本月税务发票', priority: 'medium', category: null, completed: 0, dueDate: `${thisYear}-${thisMonth}-28`, orderId: null, brandId: null, createdAt: `${thisYear}-${thisMonth}-01T00:00:00.000Z` },
];

const insertTodo = db.prepare(`
  INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const t of todoData) {
  insertTodo.run(t.id, userId, t.content, t.priority, t.category, t.completed, t.dueDate, t.orderId, t.brandId, t.createdAt);
}
console.log(`创建 ${todoData.length} 个待办`);

const brandOrderCounts: Record<string, { orders: number; income: number }> = {};
for (const o of orderData) {
  if (o.brandName) {
    if (!brandOrderCounts[o.brandName]) brandOrderCounts[o.brandName] = { orders: 0, income: 0 };
    brandOrderCounts[o.brandName].orders++;
  }
}
for (const p of paymentData) {
  if (p.brand && p.type === 'settled' && brandOrderCounts[p.brand]) {
    brandOrderCounts[p.brand].income += p.amount;
  }
}
for (const a of assetData) {
  if (a.brandName && a.saleStatus === 'sold' && brandOrderCounts[a.brandName]) {
    brandOrderCounts[a.brandName].income += a.soldAmount;
  }
}

const updateBrand = db.prepare('UPDATE brands SET totalOrders = ?, totalIncome = ? WHERE id = ? AND userId = ?');
for (const b of brandData) {
  const stats = brandOrderCounts[b.name] || { orders: 0, income: 0 };
  updateBrand.run(stats.orders, stats.income, b.id, userId);
}
console.log('更新品牌统计数据');

console.log('\n========== 测试数据创建完成 ==========');
console.log(`品牌: ${brandData.length} 个`);
console.log(`商单: ${orderData.length} 个 (已完成: ${orderData.filter(o => o.status === 'completed').length}, 进行中: ${orderData.filter(o => o.status === 'in_progress').length})`);
console.log(`账单: ${paymentData.length} 条 (已结算: ${paymentData.filter(p => p.type === 'settled').length}, 待结算: ${paymentData.filter(p => p.type === 'pending').length})`);
console.log(`资产: ${assetData.length} 个 (已出: ${assetData.filter(a => a.saleStatus === 'sold').length}, 自留: ${assetData.filter(a => a.saleStatus === 'keep').length})`);
console.log(`待办: ${todoData.length} 个 (已完成: ${todoData.filter(t => t.completed === 1).length}, 未完成: ${todoData.filter(t => t.completed === 0).length})`);

const settledTotal = paymentData.filter(p => p.type === 'settled').reduce((s, p) => s + p.amount, 0);
const pendingTotal = paymentData.filter(p => p.type === 'pending').reduce((s, p) => s + p.amount, 0);
const assetSoldTotal = assetData.filter(a => a.saleStatus === 'sold').reduce((s, a) => s + a.soldAmount, 0);
console.log(`\n财务汇总:`);
console.log(`  已结算收入: ¥${settledTotal.toLocaleString()}`);
console.log(`  待结算金额: ¥${pendingTotal.toLocaleString()}`);
console.log(`  资产已出收入: ¥${assetSoldTotal.toLocaleString()}`);
console.log(`  总收入(已结算+资产): ¥${(settledTotal + assetSoldTotal).toLocaleString()}`);

db.close();
console.log('\n数据库连接已关闭');