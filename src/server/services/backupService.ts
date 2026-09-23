import db, { generateUniqueApiKey } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { readSheet } from 'read-excel-file/node';
import { parse as parseCsv } from 'csv-parse/sync';
import { EXCEL_FIELD_MAP, ORDER_TYPE_MAP, ORDER_STATUS_MAP } from '../routes/utils/constants.js';
import { formatLocalDate, generateOrderNo, isValidDateOnly, safeJsonParse } from '../routes/utils/helpers.js';
import { syncOrderDerivedRecords, type OrderRow } from './orderService.js';
import { ApiError } from './errors.js';

export type ImportRow = Record<string, unknown>;

export const BACKUP_VERSION = 4;
// 单集合导入上限：可通过 MAX_IMPORT_ITEMS 调整（导出侧会据此给出体积/条数警告）
export const MAX_IMPORT_ITEMS = (() => {
  const configured = Number(process.env.MAX_IMPORT_ITEMS);
  return Number.isInteger(configured) && configured > 0 ? configured : 200_000;
})();
export const IMPORT_COLLECTIONS = [
  'orders',
  'brands',
  'payments',
  'todos',
  'assets',
  'publishLinks',
  'paidPromotions',
  'comments',
  'orderTemplates',
  'activityLogs',
] as const;

export type ImportCollection = typeof IMPORT_COLLECTIONS[number];
export type ImportPreview = {
  backupVersion: number | null;
  legacy: boolean;
  counts: Record<ImportCollection, number>;
  conflicts: { ids: number; orderNos: number; apiKey: number };
  warnings: string[];
  /** 备份中实际包含的集合：只有这些集合会被替换，缺失的保持原样 */
  collections: ImportCollection[];
  /** 仅包含设置（不替换任何业务集合） */
  settingsOnly: boolean;
  /** 数据清洗情况（金额/日期/枚举/文本等被改写或丢弃的条数） */
  adjustments: Record<string, number>;
  /** 当前账号在各类集合中的现有条数（用于向用户说明"替换/保留/清空"） */
  localCounts: Record<ImportCollection, number>;
  /**
   * 恢复后会被清理/解绑的关联记录（商单或品牌被替换、但这些集合不在备份中，
   * 本地记录指向的商单/品牌会消失）：评论/发布链接/推广会被删除，待办/资产解除商单关联，
   * 待办解除品牌关联。
   */
  orphans: {
    comments: number;
    links: number;
    promotions: number;
    todos: number;
    assets: number;
    todoBrands: number;
  };
  /** 品牌集合变化对依赖记录的影响（与导入时 `reconcileBrandReferences` 同一套语义） */
  brandChanges: { renamed: number; remapped: number; removed: number };
};

const COLLECTION_TABLES: Record<ImportCollection, string> = {
  orders: 'orders',
  brands: 'brands',
  payments: 'payments',
  todos: 'todos',
  assets: 'assets',
  publishLinks: 'publish_links',
  paidPromotions: 'paid_promotions',
  comments: 'comments',
  orderTemplates: 'order_templates',
  activityLogs: 'activity_logs',
};

const readImportCollection = (payload: Record<string, unknown>, name: ImportCollection): ImportRow[] => {
  const value = payload[name];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError(`${name} 必须是数组`);
  if (value.length > MAX_IMPORT_ITEMS) throw new ApiError(`${name} 超过单次导入上限 ${MAX_IMPORT_ITEMS}`);
  return value;
};

const assertUniqueValues = (items: ImportRow[], field: string, label: string) => {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object' || item[field] === undefined || item[field] === null || item[field] === '') continue;
    const value = String(item[field]);
    if (seen.has(value)) throw new ApiError(`${label}存在重复值: ${value}`);
    seen.add(value);
  }
};

export const analyzeImportPayload = (userId: string, rawPayload: unknown): ImportPreview => {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    throw new ApiError('备份文件结构无效');
  }
  const payload = rawPayload as Record<string, unknown>;
  const rawVersion = payload.backupVersion;
  const backupVersion = rawVersion === undefined ? null : Number(rawVersion);
  if (backupVersion !== null && (!Number.isInteger(backupVersion) || backupVersion < 1 || backupVersion > BACKUP_VERSION)) {
    throw new ApiError(`不支持的备份版本: ${String(rawVersion)}`);
  }

  // 拒绝无法识别的备份：缺失的集合会被当作空集合，而导入会先清空现有数据。
  // 集合字段必须真的是数组、settings 必须是有效对象才被认可，
  // 且整体必须包含至少一条业务记录或有效设置，否则视为无效恢复文件。
  // 有效备份必须满足其一：① 业务集合（不含 activityLogs）里有真实记录；
  // ② settings 是携带可识别字段的对象。仅"空数组集合"或"空 settings 对象"都会
  // 让导入变成静默清空，必须拒绝。
  const SETTINGS_FIELDS = ['displayName', 'email', 'bio', 'avatar', 'apiKey', 'orderReminder', 'weeklyReport', 'reportFrequency'];
  const rawSettings = payload.settings;
  const hasValidSettingsObject = rawSettings !== undefined
    && rawSettings !== null
    && typeof rawSettings === 'object'
    && !Array.isArray(rawSettings);
  const hasMeaningfulSettings = hasValidSettingsObject
    && SETTINGS_FIELDS.some(field => {
      const value = (rawSettings as Record<string, unknown>)[field];
      return value !== undefined && value !== null && value !== '';
    });
  if (!hasValidSettingsObject && !IMPORT_COLLECTIONS.some(name => name !== 'activityLogs' && Array.isArray(payload[name]))) {
    throw new ApiError('无法识别的备份文件：未包含任何业务数据，已拒绝导入以保护现有数据');
  }

  const collections = Object.fromEntries(
    IMPORT_COLLECTIONS.map(name => [name, readImportCollection(payload, name)]),
  ) as Record<ImportCollection, ImportRow[]>;

  // 金额错误优先拒绝：版本化备份（v3+，导出必然带合法数值）出现无法解析的金额字符串，
  // 说明文件已损坏或被手工改坏，此时宁可拒绝也不要静默清零。
  if (backupVersion !== null && backupVersion >= 3) {
    const numericAmountFields: Array<[string, string[]]> = [
      ['orders', ['actualAmount', 'expectedAmount']],
      ['payments', ['amount']],
      ['assets', ['productValue', 'soldAmount']],
    ];
    for (const [collection, fields] of numericAmountFields) {
      for (const item of collections[collection as ImportCollection]) {
        for (const field of fields) {
          const value = item?.[field];
          if (typeof value === 'string' && value.trim() !== '' && !Number.isFinite(Number(value.replace(/[,，\s]/g, '').replace(/[¥￥$]/g, '')))) {
            throw new ApiError(`备份中存在无法解析的金额（${collection}.${field}: ${value}），已拒绝导入以免数据被清零`);
          }
        }
      }
    }
  }

  const businessRecordCount = IMPORT_COLLECTIONS
    .filter(name => name !== 'activityLogs')
    .reduce((sum, name) => sum + collections[name].length, 0);
  if (businessRecordCount === 0 && !hasMeaningfulSettings) {
    throw new ApiError('备份内容为空：未包含任何业务记录，已拒绝导入以保护现有数据');
  }
  if (collections.orders.some(order => !order || typeof order !== 'object' || !String(order.title || order.name || '').trim())) {
    throw new ApiError('商单数据存在空标题');
  }
  if (collections.brands.some(brand => !brand || typeof brand !== 'object' || !String(brand.name || '').trim())) {
    throw new ApiError('品牌数据存在空名称');
  }
  if (collections.orderTemplates.some(template => (
    !template
    || typeof template !== 'object'
    || !String(template.name || '').trim()
    || !String(template.title || '').trim()
  ))) {
    throw new ApiError('商单模板存在空名称或空标题');
  }
  for (const name of IMPORT_COLLECTIONS) assertUniqueValues(collections[name], 'id', `${name} ID`);
  assertUniqueValues(collections.orders, 'orderNo', '商单号');
  const normalizedBrandNames = collections.brands.map(brand => ({
    name: String(brand.name).trim().slice(0, 50).toLocaleLowerCase('zh-CN'),
  }));
  assertUniqueValues(normalizedBrandNames, 'name', '品牌名称');
  const normalizedTemplateNames = collections.orderTemplates.map(template => ({
    name: String(template.name).trim().toLocaleLowerCase('zh-CN'),
  }));
  assertUniqueValues(normalizedTemplateNames, 'name', '商单模板名称');

  let idConflicts = 0;
  for (const name of IMPORT_COLLECTIONS) {
    const table = COLLECTION_TABLES[name];
    const findConflict = db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND userId <> ?`);
    for (const item of collections[name]) {
      if (item?.id && findConflict.get(String(item.id), userId)) idConflicts++;
    }
  }
  const orderNoConflicts = collections.orders.reduce((count, order) => (
    order?.orderNo && db.prepare('SELECT 1 FROM orders WHERE orderNo = ? AND userId <> ?').get(String(order.orderNo), userId)
      ? count + 1
      : count
  ), 0);
  const importedApiKey = (payload.settings as Record<string, unknown> | undefined)?.apiKey;
  const apiKeyConflicts = typeof importedApiKey === 'string' && importedApiKey.trim()
    && db.prepare('SELECT 1 FROM settings WHERE apiKey = ? AND userId <> ?').get(importedApiKey.trim(), userId)
    ? 1
    : 0;

  const warnings: string[] = [];
  if (backupVersion === null) warnings.push('旧版备份没有版本号，将按兼容模式导入');
  if (idConflicts) warnings.push(`${idConflicts} 个记录 ID 与其他账号冲突，导入时将自动生成新 ID`);
  if (orderNoConflicts) warnings.push(`${orderNoConflicts} 个商单号与其他账号冲突，导入时将自动生成新商单号`);
  if (apiKeyConflicts) warnings.push('API Key 与其他账号冲突，导入时将生成新 Key');

  // 只替换备份里真实存在的集合；缺失集合不再被当作"空集合"清空
  const presentCollections = IMPORT_COLLECTIONS.filter(name => Array.isArray(payload[name]));
  const settingsOnly = !presentCollections.some(name => name !== 'activityLogs');

  const adjustments = analyzeAdjustments(collections);
  const adjustmentLabels: Record<string, string> = {
    invalidAmounts: '条记录的金额无法解析或为负，将按 0 处理',
    invalidDates: '条记录的日期无效，将被清空',
    invalidEnums: '条记录的类型/状态非法，将回退为默认值',
    truncatedText: '条记录的文本超长，将被截断',
    droppedLinks: '条关联记录（链接/评论/推广）因缺少所属商单将被丢弃',
    invalidImages: '条资产图片格式非法，将被移除',
  };
  for (const [key, count] of Object.entries(adjustments)) {
    if (count > 0) warnings.push(`${count} ${adjustmentLabels[key] || key}`);
  }

  // 当前库内条数：界面据此说明"将被替换 / 保留 / 清空"
  const localCounts = Object.fromEntries(IMPORT_COLLECTIONS.map(name => {
    const table = COLLECTION_TABLES[name];
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE userId = ?`).get(userId) as { count: number };
    return [name, row.count];
  })) as Record<ImportCollection, number>;

  // 会真正清空数据的集合（备份包含该集合但为空数组）
  for (const name of presentCollections) {
    if (collections[name].length === 0 && localCounts[name] > 0) {
      warnings.push(`集合 ${name} 在备份中为空，导入后将清空现有 ${localCounts[name]} 条记录`);
    }
  }

  // 集合依赖预检：商单被整体替换时，未包含在备份里的关联集合中，
  // 指向"即将被删除的旧商单"的记录会变成打不开的孤儿（评论/链接/推广），
  // 或在有外键的表上让整次恢复失败。这些记录会在恢复时被清理/解绑，必须提前说明。
  const orphans = { comments: 0, links: 0, promotions: 0, todos: 0, assets: 0, todoBrands: 0 };
  if (presentCollections.includes('orders')) {
    const orderIdsJson = JSON.stringify(
      collections.orders.map(order => String(order?.id ?? '')).filter(Boolean),
    );
    const notSurviving = 'NOT IN (SELECT value FROM json_each(?))';
    const countOrphans = (sql: string): number => {
      const row = db.prepare(sql).get(userId, orderIdsJson) as { count: number } | undefined;
      return row?.count ?? 0;
    };
    if (!presentCollections.includes('comments')) {
      orphans.comments = countOrphans(`SELECT COUNT(*) AS count FROM comments WHERE userId = ? AND orderId ${notSurviving}`);
    }
    if (!presentCollections.includes('publishLinks')) {
      orphans.links = countOrphans(`SELECT COUNT(*) AS count FROM publish_links WHERE userId = ? AND orderId ${notSurviving}`);
    }
    if (!presentCollections.includes('paidPromotions')) {
      orphans.promotions = countOrphans(`SELECT COUNT(*) AS count FROM paid_promotions WHERE userId = ? AND orderId ${notSurviving}`);
    }
    if (!presentCollections.includes('todos')) {
      orphans.todos = countOrphans(`SELECT COUNT(*) AS count FROM todos WHERE userId = ? AND orderId IS NOT NULL AND orderId ${notSurviving}`);
    }
    if (!presentCollections.includes('assets')) {
      orphans.assets = countOrphans(`SELECT COUNT(*) AS count FROM assets WHERE userId = ? AND orderId ${notSurviving}`);
    }
    const orphanNotices: Array<[number, string]> = [
      [orphans.comments, '条评论因所属商单不在备份中，恢复后会被清理'],
      [orphans.links, '条发布链接因所属商单不在备份中，恢复后会被清理'],
      [orphans.promotions, '条付费推广记录因所属商单不在备份中，恢复后会被清理'],
      [orphans.todos, '条待办会解除与商单的关联（所属商单不在备份中）'],
      [orphans.assets, '件资产会解除与商单的关联（所属商单不在备份中）'],
    ];
    for (const [count, message] of orphanNotices) {
      if (count > 0) warnings.push(`${count} ${message}`);
    }
  }

  // 品牌依赖：与导入时的 reconcileBrandReferences 保持同一套语义
  //   ① 改名（ID 不变）→ 依赖记录同步改名，不算解绑
  //   ② ID 变化但名称相同 → 待办重新指向新 ID，不算解绑
  //   ③ 品牌确实不在备份中 → 依赖记录的品牌标记清空、待办解除品牌关联（分类一并清空）
  const brandChanges = { renamed: 0, remapped: 0, removed: 0 };
  if (presentCollections.includes('brands')) {
    const localBrands = db.prepare('SELECT id, name FROM brands WHERE userId = ?').all(userId) as Array<{ id: string; name: string }>;
    const payloadNamesById = new Map<string, string>();
    const payloadIdByName = new Map<string, string>();
    for (const [index, brand] of collections.brands.entries()) {
      const sourceId = String(brand?.id ?? '');
      const name = String(brand?.name ?? '').trim().slice(0, 50);
      if (!name) continue;
      if (sourceId) payloadNamesById.set(sourceId, name);
      // 无 ID 的旧格式品牌也要参与"同名重映射"判定（否则会被误判成"品牌已删除"）
      if (!payloadIdByName.has(name)) payloadIdByName.set(name, sourceId || `legacy-brand-${index}`);
    }
    for (const local of localBrands) {
      const payloadName = payloadNamesById.get(local.id);
      if (payloadName !== undefined) {
        if (payloadName !== local.name) brandChanges.renamed += 1;
      } else if (payloadIdByName.has(local.name)) {
        brandChanges.remapped += 1;
      } else {
        brandChanges.removed += 1;
      }
    }
  }

  if (presentCollections.includes('brands') && !presentCollections.includes('todos')) {
    // 只统计"品牌真的会消失"的待办：改名/重映射的会被同步或重新指向，不算解绑
    const payloadBrandNames = collections.brands
      .map(brand => String(brand?.name ?? '').trim())
      .filter(Boolean);
    orphans.todoBrands = (db.prepare(`
      SELECT COUNT(*) AS count FROM todos
      WHERE userId = ? AND brandId IS NOT NULL
        AND brandId NOT IN (SELECT value FROM json_each(?))
        AND (category IS NULL OR category NOT IN (SELECT value FROM json_each(?)))
    `).get(
      userId,
      JSON.stringify(collections.brands.map(brand => String(brand?.id ?? '')).filter(Boolean)),
      JSON.stringify(payloadBrandNames),
    ) as { count: number } | undefined)?.count ?? 0;
  } else if (presentCollections.includes('todos')) {
    // 反向：只恢复待办时，品牌可能来自库里保留的品牌；两者都不存在的引用才会被清除
    const localBrandIds = (db.prepare('SELECT id FROM brands WHERE userId = ?').all(userId) as Array<{ id: string }>)
      .map(row => row.id);
    const availableBrandIds = new Set<string>([
      ...collections.brands.map(brand => String(brand?.id ?? '')),
      ...localBrandIds,
    ].filter(Boolean));
    orphans.todoBrands = collections.todos.filter(todo => {
      const brandId = todo?.brandId;
      if (brandId === undefined || brandId === null || brandId === '') return false;
      return !availableBrandIds.has(String(brandId));
    }).length;
  }
  if (orphans.todoBrands > 0) {
    warnings.push(`${orphans.todoBrands} 条待办会解除与品牌的关联（品牌不在本次恢复的数据中，分类同时清空）`);
  }
  if (brandChanges.renamed > 0) {
    warnings.push(`${brandChanges.renamed} 个品牌改名：相关商单、账单、资产、商单模板与待办分类会同步改名`);
  }
  if (brandChanges.remapped > 0) {
    warnings.push(`${brandChanges.remapped} 个品牌名称相同但 ID 变化：相关待办会重新指向新品牌`);
  }
  if (brandChanges.removed > 0) {
    warnings.push(`${brandChanges.removed} 个品牌不在备份中：相关记录的品牌标记会被清空`);
  }

  return {
    backupVersion,
    legacy: backupVersion === null,
    counts: Object.fromEntries(IMPORT_COLLECTIONS.map(name => [name, collections[name].length])) as Record<ImportCollection, number>,
    conflicts: { ids: idConflicts, orderNos: orderNoConflicts, apiKey: apiKeyConflicts },
    warnings,
    collections: presentCollections,
    settingsOnly,
    adjustments,
    localCounts,
    orphans,
    brandChanges,
  };
};

// 数据清洗的干跑统计：让预检能告诉用户"哪些记录会被改写/丢弃"
const analyzeAdjustments = (collections: Record<ImportCollection, ImportRow[]>): Record<string, number> => {
  const result: Record<string, number> = {
    invalidAmounts: 0,
    invalidDates: 0,
    invalidEnums: 0,
    truncatedText: 0,
    droppedLinks: 0,
    invalidImages: 0,
  };
  const amountIsInvalid = (value: unknown): boolean => {
    if (value === undefined || value === null || value === '') return false;
    const cleaned = typeof value === 'string' ? value.replace(/[,，\s]/g, '').replace(/[¥￥$]/g, '') : value;
    const num = Number(cleaned);
    return !Number.isFinite(num) || num < 0;
  };
  const dateIsInvalid = (value: unknown): boolean => (
    value !== undefined && value !== null && value !== '' && !isValidDateOnly(value)
  );

  for (const order of collections.orders) {
    if (amountIsInvalid(order?.actualAmount ?? order?.amount) || amountIsInvalid(order?.expectedAmount)) result.invalidAmounts++;
    if (dateIsInvalid(order?.acceptDate) || dateIsInvalid(order?.submitDate)) result.invalidDates++;
    if (order?.type && !['paid', 'product_exchange', 'direct', 'ecard'].includes(String(order.type))) result.invalidEnums++;
    if (order?.status && !['in_progress', 'completed', 'cancelled'].includes(String(order.status))) result.invalidEnums++;
    if (String(order?.title || order?.name || '').length > 100) result.truncatedText++;
  }
  for (const payment of collections.payments) {
    if (amountIsInvalid(payment?.amount ?? payment?.actualAmount)) result.invalidAmounts++;
    if (dateIsInvalid(payment?.dueDate) || dateIsInvalid(payment?.settledDate)) result.invalidDates++;
  }
  for (const asset of collections.assets) {
    if (amountIsInvalid(asset?.productValue ?? asset?.value) || amountIsInvalid(asset?.soldAmount)) result.invalidAmounts++;
    if (dateIsInvalid(asset?.soldDate)) result.invalidDates++;
    if (asset?.image && (typeof asset.image !== 'string' || !String(asset.image).startsWith('data:image/'))) result.invalidImages++;
  }
  for (const todo of collections.todos) {
    if (dateIsInvalid(todo?.dueDate)) result.invalidDates++;
    if (String(todo?.content || '').length > 500) result.truncatedText++;
  }
  for (const link of collections.publishLinks) {
    const url = link?.url;
    if (url && (typeof url !== 'string' || !/^https?:\/\//i.test(String(url)))) result.droppedLinks++;
  }
  for (const log of collections.activityLogs) {
    if (String(log?.details || '').length > 1000) result.truncatedText++;
  }
  return result;
};

export const allocateImportedId = (table: string, userId: string, value: unknown): string => {
  const requestedId = typeof value === 'string' && value ? value : uuidv4();
  const conflict = db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND userId <> ?`).get(requestedId, userId);
  return conflict ? uuidv4() : requestedId;
};

export const allocateImportedOrderNo = (userId: string, value: unknown): string => {
  const requestedOrderNo = typeof value === 'string' && value.trim() ? value.trim() : generateOrderNo();
  return db.prepare('SELECT 1 FROM orders WHERE orderNo = ? AND userId <> ?').get(requestedOrderNo, userId)
    ? generateOrderNo()
    : requestedOrderNo;
};

const normalizeCellValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return formatLocalDate(value);
  }
  return value ?? '';
};

const rowsToObjects = (rows: unknown[][]): ImportRow[] => {
  const headerIndex = rows.findIndex(row => row.some(cell => String(cell ?? '').trim()));
  if (headerIndex === -1) return [];

  const headers = rows[headerIndex].map(cell => String(cell ?? '').trim());
  return rows.slice(headerIndex + 1)
    .map(row => {
      const item: ImportRow = {};
      headers.forEach((header, index) => {
        if (header) item[header] = normalizeCellValue(row[index]);
      });
      return item;
    })
    .filter(row => Object.values(row).some(value => String(value ?? '').trim()));
};

export const parseUploadedOrderFile = async (file: { originalname: string; path: string }): Promise<ImportRow[]> => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === '.csv') {
    return parseCsv(fs.readFileSync(file.path), {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as ImportRow[];
  }

  if (ext === '.xlsx') {
    const rows = await readSheet(file.path);
    return rowsToObjects(rows);
  }

  throw new Error('不支持的文件格式');
};

const normalizeStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim().slice(0, 30)).filter(Boolean);
  }

  if (typeof value !== 'string') return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  const parsed = safeJsonParse<unknown>(trimmed, null);
  if (Array.isArray(parsed)) {
    return parsed.map(item => String(item).trim().slice(0, 30)).filter(Boolean);
  }

  return trimmed.split(/[,，、\n]/).map(item => item.trim().slice(0, 30)).filter(Boolean);
};

export const normalizePaymentType = (type: unknown): string => {
  if (type === 'settled' || type === 'pending') return type;
  if (type === 'received') return 'settled';
  return 'pending';
};

export const resolveImportedApiKey = (userId: string, value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const apiKey = value.trim();
  const conflict = db.prepare('SELECT userId FROM settings WHERE apiKey = ? AND userId <> ?').get(apiKey, userId);
  if (!conflict) return apiKey;

  return generateUniqueApiKey();
};

const mapImportedOrderRow = (row: ImportRow): ImportRow => {
  const mappedRow: ImportRow = { ...row };
  Object.keys(row).forEach(key => {
    const mappedKey = EXCEL_FIELD_MAP[key.trim()];
    if (mappedKey) mappedRow[mappedKey] = row[key];
  });
  return mappedRow;
};

const normalizeOrderType = (value: unknown): string => {
  if (typeof value !== 'string') return 'paid';
  return ORDER_TYPE_MAP[value] || value || 'paid';
};

const normalizeOrderStatus = (value: unknown): string => {
  if (typeof value !== 'string') return 'in_progress';
  return ORDER_STATUS_MAP[value] || value || 'in_progress';
};

/**
 * 关联记录（评论/发布链接/推广记录/资产）的商单解析：
 * 既接受"本次导入的商单"，也接受"数据库中已存在的商单"。
 * 旧实现只认前者，导致只恢复关联数据（对应商单已在库中）时全部被丢弃，
 * 却仍返回成功——用户看到评论数量为 0 而不知原因。
 */
export const resolveOrderIdFactory = (
  orderIdMap: Map<string, string>,
  importedOrderIds: Set<string>,
  options: {
    userId?: string;
    /** 解析失败时的回调（用于统计被丢弃的关联记录） */
    onUnresolved?: () => void;
  } = {},
) => {
  const existingOrderStmt = options.userId
    ? db.prepare('SELECT 1 FROM orders WHERE id = ? AND userId = ?')
    : null;

  return (orderId: unknown): string | null => {
    if (!orderId) {
      options.onUnresolved?.();
      return null;
    }
    const sourceId = String(orderId);
    const resolved = orderIdMap.get(sourceId) || sourceId;
    if (importedOrderIds.has(resolved)) return resolved;
    // 回退：库中已存在且属于当前用户的商单同样有效
    if (existingOrderStmt && existingOrderStmt.get(resolved, options.userId!)) return resolved;
    options.onUnresolved?.();
    return null;
  };
};

export const insertImportedOrder = (
  userId: string,
  mappedRow: ImportRow,
  options: { syncDerived?: boolean; skipTodo?: boolean } = {},
): string => {
  const title = String(mappedRow.title || mappedRow.name || '').trim().slice(0, 100);
  if (!title) {
    throw new Error('缺少标题');
  }

  const id = allocateImportedId('orders', userId, mappedRow.id);
  const orderNo = allocateImportedOrderNo(userId, mappedRow.orderNo);
  const brandName = typeof mappedRow.brandName === 'string' && mappedRow.brandName.trim()
    ? mappedRow.brandName.trim().slice(0, 50)
    : (typeof mappedRow.brand === 'string' && mappedRow.brand.trim() ? mappedRow.brand.trim().slice(0, 50) : null);
  const platforms = normalizeStringArray(mappedRow.platforms ?? mappedRow.platform).slice(0, 10);
  const clampAmount = (value: unknown): number => {
    // 兼容 CSV 常见的千分位与货币符号格式（如 "1,000"、"¥100"）
    const cleaned = typeof value === 'string'
      ? value.replace(/[,，\s]/g, '').replace(/[¥￥$]/g, '')
      : value;
    const num = Number(cleaned);
    if (!Number.isFinite(num) || num <= 0) return 0;
    return Math.min(num, 99999999);
  };
  const expectedAmount = clampAmount(mappedRow.expectedAmount ?? mappedRow.actualAmount ?? mappedRow.amount ?? 0);
  const actualAmount = clampAmount(mappedRow.actualAmount ?? mappedRow.amount ?? mappedRow.expectedAmount ?? 0);
  const productValue = clampAmount(mappedRow.productValue ?? mappedRow.value ?? 0);
  const asDateOnly = (value: unknown): string | null => (isValidDateOnly(value) ? value : null);
  const acceptDate = asDateOnly(mappedRow.acceptDate) || asDateOnly(mappedRow.publishDate);
  const submitDate = asDateOnly(mappedRow.submitDate) || asDateOnly(mappedRow.deadline);
  const type = normalizeOrderType(mappedRow.type);
  const safeType = ['paid', 'product_exchange', 'direct', 'ecard'].includes(type) ? type : 'paid';
  const status = normalizeOrderStatus(mappedRow.status);
  const safeStatus = ['in_progress', 'completed', 'cancelled'].includes(status) ? status : 'in_progress';
  const productName = typeof mappedRow.productName === 'string' && mappedRow.productName.trim()
    ? mappedRow.productName.trim().slice(0, 100)
    : null;
  const createdAt = mappedRow.createdAt || new Date().toISOString();

  db.prepare(`
    INSERT INTO orders (id, userId, orderNo, title, type, status, expectedAmount, actualAmount, brandName, platforms, acceptDate, submitDate, productName, productValue, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    orderNo,
    title,
    safeType,
    safeStatus,
    expectedAmount,
    actualAmount,
    brandName,
    JSON.stringify(platforms),
    acceptDate,
    submitDate,
    productName,
    productValue,
    createdAt,
  );

  const brand = brandName
    ? db.prepare('SELECT id FROM brands WHERE name = ? AND userId = ?').get(brandName, userId) as { id: string } | undefined
    : null;
  // 完整备份恢复时跳过自动重建待办：备份中已包含原始待办（含用户手动改过的完成状态），
  // 重建会生成新 ID 并把完成状态重置为商单状态。
  if (!options.skipTodo) {
    db.prepare(`
      INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      userId,
      `商单任务: ${title}`,
      'high',
      brandName,
      safeStatus === 'completed' ? 1 : 0,
      submitDate,
      id,
      brand?.id || null,
    );
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND userId = ?').get(id, userId) as OrderRow;
  if (options.syncDerived !== false) {
    syncOrderDerivedRecords(order, userId);
  }
  return id;
};

export const importOrderRows = (userId: string, rows: ImportRow[], firstLineNumber: number) => {
  const results = { success: 0, failed: 0, errors: [] as string[] };

  rows.forEach((row, index) => {
    try {
      insertImportedOrder(userId, mapImportedOrderRow(row));
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push(`第${index + firstLineNumber}行: ${error instanceof Error ? error.message : '处理失败'}`);
    }
  });

  return results;
};
