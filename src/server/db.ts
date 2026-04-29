import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../');
const dbPath = path.join(dataDir, 'database.sqlite');

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    displayName TEXT,
    avatar TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    industry TEXT,
    contact TEXT,
    phone TEXT,
    totalOrders INTEGER DEFAULT 0,
    totalIncome REAL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    orderNo TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    expectedAmount REAL DEFAULT 0,
    actualAmount REAL DEFAULT 0,
    brandName TEXT,
    platforms TEXT,
    publishDate TEXT,
    deadline TEXT,
    acceptDate TEXT,
    submitDate TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS publish_links (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL,
    userId TEXT NOT NULL,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orderId) REFERENCES orders(id),
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    orderNo TEXT,
    brand TEXT,
    amount REAL NOT NULL,
    type TEXT DEFAULT 'pending',
    date TEXT,
    method TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT DEFAULT 'medium',
    category TEXT,
    completed INTEGER DEFAULT 0,
    dueDate TEXT,
    orderId TEXT,
    brandId TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    userId TEXT UNIQUE NOT NULL,
    displayName TEXT,
    email TEXT,
    bio TEXT,
    orderReminder INTEGER DEFAULT 1,
    weeklyReport INTEGER DEFAULT 0,
    avatar TEXT,
    apiKey TEXT,
    darkMode INTEGER DEFAULT 0,
    reportFrequency TEXT DEFAULT 'weekly',
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    action TEXT NOT NULL,
    entityType TEXT,
    entityId TEXT,
    details TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    orderId TEXT NOT NULL,
    content TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`);

// Migrations for existing tables - add userId column if not exists
// 获取第一个实际用户的 ID 作为默认值，避免多用户数据混乱
let defaultUserId = '1';
try {
  const firstUser = db.prepare('SELECT id FROM users LIMIT 1').get() as any;
  if (firstUser) {
    defaultUserId = firstUser.id;
  }
} catch (e) {
    console.warn('查询用户设置失败，使用默认值:', e instanceof Error ? e.message : e);
  }

const migrations = [
  { table: 'brands', column: 'userId', type: `TEXT NOT NULL DEFAULT "${defaultUserId}"` },
  { table: 'orders', column: 'userId', type: `TEXT NOT NULL DEFAULT "${defaultUserId}"` },
  { table: 'payments', column: 'userId', type: `TEXT NOT NULL DEFAULT "${defaultUserId}"` },
  { table: 'todos', column: 'userId', type: `TEXT NOT NULL DEFAULT "${defaultUserId}"` },
  { table: 'activity_logs', column: 'userId', type: `TEXT NOT NULL DEFAULT "${defaultUserId}"` },
  { table: 'comments', column: 'userId', type: `TEXT NOT NULL DEFAULT "${defaultUserId}"` },
];

for (const migration of migrations) {
  const columns = db.prepare(`PRAGMA table_info(${migration.table})`).all() as any[];
  const columnNames = columns.map(c => c.name);
  if (!columnNames.includes(migration.column)) {
    db.exec(`ALTER TABLE ${migration.table} ADD COLUMN ${migration.column} ${migration.type};`);
  }
}

// Ensure settings has userId column
const settingsColumns = db.prepare("PRAGMA table_info(settings)").all() as any[];
const settingsColumnNames = settingsColumns.map(c => c.name);
if (!settingsColumnNames.includes('userId')) {
  db.exec(`ALTER TABLE settings ADD COLUMN userId TEXT;`);
  // Create unique index for userId
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_userId ON settings(userId);`);
  } catch (e) {
    console.warn('创建索引时出现警告（可能已存在）:', e instanceof Error ? e.message : e);
  }
}

// Ensure all columns exist in settings (for migrations)
const columns = db.prepare("PRAGMA table_info(settings)").all() as any[];
const columnNames = columns.map(c => c.name);

const requiredColumns = [
  { name: 'displayName', type: 'TEXT' },
  { name: 'email', type: 'TEXT' },
  { name: 'bio', type: 'TEXT' },
  { name: 'orderReminder', type: 'INTEGER DEFAULT 1' },
  { name: 'weeklyReport', type: 'INTEGER DEFAULT 0' },
  { name: 'avatar', type: 'TEXT' },
  { name: 'apiKey', type: 'TEXT' },
  { name: 'darkMode', type: 'INTEGER DEFAULT 0' },
  { name: 'reportFrequency', type: "TEXT DEFAULT 'weekly'" }
];

for (const col of requiredColumns) {
  if (!columnNames.includes(col.name)) {
    db.exec(`ALTER TABLE settings ADD COLUMN ${col.name} ${col.type};`);
  }
}

// Ensure publish_links table exists
const publishLinksExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='publish_links'").get() as any;
if (!publishLinksExists) {
  db.exec(`
    CREATE TABLE publish_links (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      userId TEXT NOT NULL,
      platform TEXT NOT NULL,
      url TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orderId) REFERENCES orders(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);
}

// Ensure publish_links has userId column
const publishLinksColumns = db.prepare("PRAGMA table_info(publish_links)").all() as any[];
const publishLinksColumnNames = publishLinksColumns.map(c => c.name);
if (publishLinksColumnNames.length > 0 && !publishLinksColumnNames.includes('userId')) {
  db.exec(`ALTER TABLE publish_links ADD COLUMN userId TEXT NOT NULL DEFAULT "${defaultUserId}";`);
}

// Ensure todos has orderId and brandId
const todoColumns = db.prepare("PRAGMA table_info(todos)").all() as any[];
const todoColumnNames = todoColumns.map(c => c.name);
if (!todoColumnNames.includes('orderId')) {
  db.exec('ALTER TABLE todos ADD COLUMN orderId TEXT;');
}
if (!todoColumnNames.includes('brandId')) {
  db.exec('ALTER TABLE todos ADD COLUMN brandId TEXT;');
}
if (!todoColumnNames.includes('category')) {
  db.exec('ALTER TABLE todos ADD COLUMN category TEXT;');
}

// Ensure orders has acceptDate and submitDate (迁移旧字段)
const orderColumns = db.prepare("PRAGMA table_info(orders)").all() as any[];
const orderColumnNames = orderColumns.map(c => c.name);
if (!orderColumnNames.includes('acceptDate')) {
  db.exec('ALTER TABLE orders ADD COLUMN acceptDate TEXT;');
  db.exec("UPDATE orders SET acceptDate = publishDate WHERE acceptDate IS NULL AND publishDate IS NOT NULL;");
}
if (!orderColumnNames.includes('submitDate')) {
  db.exec('ALTER TABLE orders ADD COLUMN submitDate TEXT;');
  db.exec("UPDATE orders SET submitDate = deadline WHERE submitDate IS NULL AND deadline IS NOT NULL;");
}

// ========== 性能优化：创建索引 ==========
const createIndexes = () => {
  const indexes = [
    // 用户相关索引
    'CREATE INDEX IF NOT EXISTS idx_orders_userId ON orders(userId)',
    'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
    'CREATE INDEX IF NOT EXISTS idx_orders_createdAt ON orders(createdAt)',
    'CREATE INDEX IF NOT EXISTS idx_brands_userId ON brands(userId)',
    'CREATE INDEX IF NOT EXISTS idx_payments_userId ON payments(userId)',
    'CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(type)',
    'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date)',
    'CREATE INDEX IF NOT EXISTS idx_todos_userId ON todos(userId)',
    'CREATE INDEX IF NOT EXISTS idx_todos_dueDate ON todos(dueDate)',
    'CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed)',
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_userId ON activity_logs(userId)',
    'CREATE INDEX IF NOT EXISTS idx_activity_logs_createdAt ON activity_logs(createdAt)',
    'CREATE INDEX IF NOT EXISTS idx_comments_orderId ON comments(orderId)',
    // 复合索引
    'CREATE INDEX IF NOT EXISTS idx_orders_userId_status ON orders(userId, status)',
    'CREATE INDEX IF NOT EXISTS idx_payments_userId_type ON payments(userId, type)',
  ];

  let successCount = 0;
  let failCount = 0;

  indexes.forEach(indexSql => {
    try {
      db.exec(indexSql);
      successCount++;
    } catch (e) {
      failCount++;
      console.error('索引创建失败:', indexSql, e);
    }
  });

  if (failCount > 0) {
    console.error(`警告: ${failCount} 个索引创建失败，可能影响查询性能`);
  }
};

createIndexes();

export default db;