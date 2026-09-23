/**
 * SQLite 行类型：better-sqlite3 的查询结果在类型层面是 unknown，
 * 这里集中声明各表的行结构，替代散落的 `as any`，
 * 让读写行的代码获得真实字段类型与拼写检查。
 */

export interface CountRow {
  count: number;
}

/** PRAGMA table_info(...) 的结果行 */
export interface TableInfoRow {
  cid?: number;
  name: string;
  type?: string | null;
  notnull?: number;
  dflt_value?: string | null;
  pk?: number;
}

/** sqlite_master 查询结果行 */
export interface SqliteMasterRow {
  name: string;
}

export interface UserRow {
  id: string;
  email: string;
  password: string;
  displayName: string | null;
  avatar: string | null;
  createdAt?: string;
  tokenVersion?: number;
}

export interface OrderRow {
  id: string;
  userId: string;
  orderNo: string;
  title: string;
  type: string;
  status: string;
  expectedAmount: number | null;
  actualAmount: number | null;
  brandName: string | null;
  platforms: string | null;
  publishDate?: string | null;
  deadline?: string | null;
  acceptDate: string | null;
  submitDate: string | null;
  productName: string | null;
  productValue: number | null;
  createdAt?: string;
}

export interface OrderTemplateRow {
  id: string;
  userId: string;
  name: string;
  title: string;
  type: string;
  actualAmount: number | null;
  brandName: string | null;
  platforms: string | null;
  productName: string | null;
  productValue: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface BrandRow {
  id: string;
  userId: string;
  name: string;
  industry: string | null;
  contact: string | null;
  phone: string | null;
  contacts: string | null;
  totalOrders: number | null;
  totalIncome: number | null;
  createdAt?: string;
}

export interface PaymentRow {
  id: string;
  userId: string;
  orderNo: string | null;
  brand: string | null;
  amount: number;
  type: string | null;
  date: string | null;
  dueDate?: string | null;
  settledDate?: string | null;
  method: string | null;
  createdAt?: string;
}

export interface AssetRow {
  id: string;
  userId: string;
  orderId: string;
  orderNo: string | null;
  brandName: string | null;
  productName: string;
  productValue: number | null;
  image: string | null;
  saleStatus: string | null;
  soldAmount: number | null;
  soldDate: string | null;
  createdAt?: string;
}

export interface TodoRow {
  id: string;
  userId: string;
  content: string;
  priority: string | null;
  category: string | null;
  completed: number | null;
  dueDate: string | null;
  orderId: string | null;
  brandId: string | null;
  createdAt?: string;
}

export interface CommentRow {
  id: string;
  userId: string;
  orderId: string;
  content: string;
  createdAt?: string;
}

export interface PublishLinkRow {
  id: string;
  orderId: string;
  userId: string;
  platform: string;
  url: string;
  createdAt?: string;
}

export interface PaidPromotionRow {
  id: string;
  orderId: string;
  userId: string;
  platform: string;
  amount: number;
  createdAt?: string;
}

export interface ActivityLogRow {
  id: string;
  userId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: string | null;
  createdAt?: string;
}

export interface SettingsRow {
  id: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  bio: string | null;
  orderReminder: number | null;
  weeklyReport: number | null;
  avatar: string | null;
  apiKey: string | null;
  darkMode?: number | null;
  reportFrequency: string | null;
}

/** 导入数据来自外部 JSON：以未知字段的普通对象表示，用显式转换读取字段 */
export type ImportedRecord = Record<string, unknown>;
