import { Router } from 'express';
import db from '../db.js';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { logActivity, getUserId } from './utils/index.js';
import { getApiErrorMessage, getApiErrorStatus } from '../services/errors.js';
import { generateOrderNo, safeJsonParse, isValidDateOnly, formatLocalDate } from './utils/helpers.js';
import { IMPORT_JSON_BODY_LIMIT, parseBodyLimitBytes, buildExportSizeWarning } from '../requestBodyLimits.js';
import { syncOrderDerivedRecords, type OrderRow } from '../services/orderService.js';
import type { ImportRow } from '../services/backupService.js';
import type { SettingsRow } from '../dbRows.js';
import {
  BACKUP_VERSION,
  analyzeImportPayload,
  type ImportCollection,
  parseUploadedOrderFile,
  importOrderRows,
  resolveOrderIdFactory,
  allocateImportedId,
  allocateImportedOrderNo,
  insertImportedOrder,
  MAX_IMPORT_ITEMS,
  normalizePaymentType,
  resolveImportedApiKey,
} from '../services/backupService.js';

const router = Router();

// 发布链接：仅接受 http/https（与 API 侧 publishLinkService 一致）
const normalizeLinkUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
};

// 资产状态白名单（与 assets 路由一致）
const normalizeSaleStatus = (value: unknown): string => (value === 'sold' ? 'sold' : 'keep');

// 开关字段归一化：数据库导出的是 0/1，手工构造的备份可能是布尔或字符串
const normalizeFlag = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
};

// 可选字符串字段统一截断
const clampText = (value: unknown, max: number): string | null => {
  if (value === undefined || value === null || value === '') return null;
  return String(value).slice(0, max);
};

const asDateOnlyOrNull = (value: unknown): string | null => (isValidDateOnly(value) ? value : null);

// 导入数据来自外部 JSON：字段一律按 unknown 处理，白名单校验前先取字符串
const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

// 资产图片：只接受 data:image/ 开头的 base64 数据，并限制单张体量（约 8MB 文本）
const MAX_ASSET_IMAGE_LENGTH = 8 * 1024 * 1024;
const normalizeAssetImage = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('data:image/')) return null;
  if (trimmed.length > MAX_ASSET_IMAGE_LENGTH) return null;
  return trimmed;
};

// 上传目录跟随 DATA_DIR（容器内即持久卷 /app/data/uploads），
// 避免旧实现把临时文件写在容器可写层、且与文档声明不一致
const uploadDir = path.join(process.env.DATA_DIR || '.', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedExt = ['.xlsx', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExt.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传 .xlsx 或 .csv 文件'));
    }
  },
});

router.get('/export', (req, res) => {
  try {
    const userId = getUserId(req);

    const orders = db.prepare('SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC').all(userId) as ImportRow[];
    const brands = db.prepare('SELECT * FROM brands WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const payments = db.prepare('SELECT * FROM payments WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const todos = db.prepare('SELECT * FROM todos WHERE userId = ? ORDER BY createdAt DESC').all(userId) as ImportRow[];
    const settings = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId);
    const publishLinks = db.prepare('SELECT * FROM publish_links WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const paidPromotions = db.prepare('SELECT * FROM paid_promotions WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const comments = db.prepare('SELECT * FROM comments WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const assets = db.prepare('SELECT * FROM assets WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    const orderTemplates = db.prepare('SELECT * FROM order_templates WHERE userId = ? ORDER BY updatedAt DESC, createdAt DESC').all(userId) as ImportRow[];
    const activityLogs = db.prepare('SELECT * FROM activity_logs WHERE userId = ? ORDER BY createdAt DESC').all(userId);

    const exportWarnings: string[] = [];
    const countMap: Record<string, number> = {
      orders: orders.length,
      brands: brands.length,
      payments: payments.length,
      todos: todos.length,
      assets: assets.length,
      publishLinks: publishLinks.length,
      paidPromotions: paidPromotions.length,
      comments: comments.length,
      orderTemplates: orderTemplates.length,
      activityLogs: activityLogs.length,
    };
    for (const [name, count] of Object.entries(countMap)) {
      if (count > MAX_IMPORT_ITEMS) {
        exportWarnings.push(`集合 ${name} 有 ${count} 条，超过单次导入上限 ${MAX_IMPORT_ITEMS}，这份备份将无法直接恢复（可清理数据或调整 MAX_IMPORT_ITEMS）`);
      }
    }

    const payload = {
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      counts: {
        orders: orders.length,
        brands: brands.length,
        payments: payments.length,
        todos: todos.length,
        assets: assets.length,
        publishLinks: publishLinks.length,
        paidPromotions: paidPromotions.length,
        comments: comments.length,
        orderTemplates: orderTemplates.length,
        activityLogs: activityLogs.length,
      },
      orders: orders.map((o: ImportRow) => ({
        ...o,
        platforms: safeJsonParse(typeof o.platforms === 'string' ? o.platforms : null, []),
      })),
      brands,
      payments,
      todos: todos.map((t: ImportRow) => ({ ...t, completed: Boolean(t.completed) })),
      settings,
      publishLinks,
      paidPromotions,
      comments,
      assets,
      activityLogs,
      orderTemplates: orderTemplates.map((template: ImportRow) => ({
        ...template,
        platforms: safeJsonParse(typeof template.platforms === 'string' ? template.platforms : null, []),
      })),
      exportWarnings,
    };

    // 体积预警：序列化一次同时用于测量与发送，避免"导出成功但恢复时超限"。
    // 体积按 UTF-8 字节数判断（中文字符 3 字节，用字符串长度会低估）。
    const limitBytes = parseBodyLimitBytes(IMPORT_JSON_BODY_LIMIT);
    let serialized = JSON.stringify(payload);
    const sizeWarning = buildExportSizeWarning(serialized, limitBytes, IMPORT_JSON_BODY_LIMIT);
    if (sizeWarning) {
      exportWarnings.push(sizeWarning);
      serialized = JSON.stringify(payload);
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(serialized);
  } catch (error) {
    console.error('导出数据错误:', error);
    return res.status(500).json({ error: '导出数据失败，请稍后重试' });
  }
});

router.post('/clear', (req, res) => {
  try {
    const userId = getUserId(req);

    const clearUserData = db.transaction(() => {
      db.prepare('DELETE FROM comments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM paid_promotions WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM publish_links WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM activity_logs WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM todos WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM payments WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM order_templates WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM assets WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM orders WHERE userId = ?').run(userId);
      db.prepare('DELETE FROM brands WHERE userId = ?').run(userId);
    });

    db.pragma('foreign_keys = OFF');
    try {
      clearUserData();
    } finally {
      db.pragma('foreign_keys = ON');
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('清空数据错误:', error);
    return res.status(500).json({ error: '清空数据失败，请稍后重试' });
  }
});

router.post('/import/preview', (req, res) => {
  try {
    return res.json(analyzeImportPayload(getUserId(req), req.body));
  } catch (error) {
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '导入预检失败') });
  }
});

router.post('/import', (req, res) => {
  try {
    const userId = getUserId(req);
    const preview = analyzeImportPayload(userId, req.body);
    const { orders, brands, payments, todos, settings: importedSettings, publishLinks, paidPromotions, comments, assets, orderTemplates, activityLogs, operationDate } = req.body;

    // 被丢弃的关联记录统计（关系指向的商单在备份与库中都不存在）
    const dropped = { links: 0, promotions: 0, comments: 0, assets: 0, todos: 0 };
    // 被清理/解绑的本地孤儿记录（商单/品牌被替换，但这些记录指向的商单/品牌不在备份中）
    const orphaned = { comments: 0, links: 0, promotions: 0, todos: 0, assets: 0, todoBrands: 0 };
    // 品牌关联同步统计（改名同步 / 同 ID 重映射 / 删除清空依赖标记）
    const brandSync = { renamed: 0, remapped: 0, removed: 0, refsUpdated: 0 };

    const importData = db.transaction(() => {
      const brandIdMap = new Map<string, string>();
      const orderIdMap = new Map<string, string>();
      const orderNoMap = new Map<string, string>();
      const importedOrderIds = new Set<string>();
      const resolveImportedOrderId = resolveOrderIdFactory(orderIdMap, importedOrderIds, {
        userId,
      });
      const resolveImportedOrderNo = (value: unknown): string | null => {
        if (typeof value !== 'string' || !value.trim()) return null;
        const sourceOrderNo = value.trim();
        const existing = orderNoMap.get(sourceOrderNo);
        if (existing) return existing;
        const resolved = allocateImportedOrderNo(userId, sourceOrderNo);
        orderNoMap.set(sourceOrderNo, resolved);
        return resolved;
      };

      if (Array.isArray(brands)) {
        brands.forEach((brand: ImportRow) => {
          if (brand?.id) brandIdMap.set(String(brand.id), allocateImportedId('brands', userId, brand.id));
        });
      }
      if (Array.isArray(orders)) {
        orders.forEach((order: ImportRow) => {
          if (order?.id) orderIdMap.set(String(order.id), allocateImportedId('orders', userId, order.id));
          if (order?.orderNo) orderNoMap.set(String(order.orderNo), allocateImportedOrderNo(userId, order.orderNo));
        });
      }

      // 只替换备份中真实存在的集合：缺失集合不再被当成"空集合"清空，
      // 从而支持"仅恢复设置"以及旧版/部分备份的安全合并。
      const replaced = new Set(preview.collections);
      const clearIfReplaced = (collection: ImportCollection, sql: string) => {
        if (replaced.has(collection)) db.prepare(sql).run(userId);
      };
      // 集合依赖：商单被替换时，先处理依赖它的关联记录。
      // 备份未包含这些集合时，本地记录只可能指向"即将删除的旧商单"：
      //   ① 有外键的 publish_links / paid_promotions 会让 DELETE orders 直接失败（整次恢复报错）；
      //   ② 无外键的 comments 会留下指向不存在商单的孤儿记录（详情里打不开）；
      //   ③ todos / assets 的商单关联会变成悬空引用，这里一并清除并计数上报。
      const notSurviving = 'NOT IN (SELECT value FROM json_each(?))';
      const survivingOrderIds = JSON.stringify(Array.from(orderIdMap.values()));
      const detachOrderRelations = () => {
        if (!replaced.has('orders')) return;
        orphaned.comments = db.prepare(`DELETE FROM comments WHERE userId = ? AND orderId ${notSurviving}`).run(userId, survivingOrderIds).changes;
        orphaned.links = db.prepare(`DELETE FROM publish_links WHERE userId = ? AND orderId ${notSurviving}`).run(userId, survivingOrderIds).changes;
        orphaned.promotions = db.prepare(`DELETE FROM paid_promotions WHERE userId = ? AND orderId ${notSurviving}`).run(userId, survivingOrderIds).changes;
        orphaned.todos = db.prepare(`UPDATE todos SET orderId = NULL WHERE userId = ? AND orderId IS NOT NULL AND orderId ${notSurviving}`).run(userId, survivingOrderIds).changes;
        // assets.orderId 非空：沿用导入时的 'imported-<id>' 约定标记为"已脱离商单"
        orphaned.assets = db.prepare(`UPDATE assets SET orderId = 'imported-' || id WHERE userId = ? AND orderId ${notSurviving}`).run(userId, survivingOrderIds).changes;
      };

      // 品牌依赖统一处理：与手动改名（brandService.updateBrand）/ 手动删除（deleteBrand）保持同一套语义，
      // 避免"同一次品牌变化，手动路径与导入路径结果不同"。
      //   ① 品牌仍在但改名 → 同步依赖记录上的品牌名（商单/账单/资产/商单模板 + 待办分类）
      //   ② 名称不变但 ID 变化（跨账号冲突重新分配）→ 待办重新指向新 ID，而不是当作"品牌已删除"
      //   ③ 品牌确实不在备份中 → 依赖记录的品牌标记清空、待办解除品牌关联（分类一并清空）
      const brandTextTargets = [
        { table: 'orders', column: 'brandName' },
        { table: 'payments', column: 'brand' },
        { table: 'assets', column: 'brandName' },
        { table: 'order_templates', column: 'brandName' },
      ] as const;

      // 一次 UPDATE 完成整张名称映射：每行的旧值只匹配一次。
      // 逐个品牌串行改名会连环命中（甲↔乙 互换时，第二步会把第一步刚写好的名字再改回去）。
      const applyBrandNameMap = (table: string, column: string, nameMap: Map<string, string | null>): number => {
        const entries = Array.from(nameMap.entries());
        const caseParts = entries.map(() => 'WHEN ? THEN ?').join(' ');
        const params: Array<string | null> = [];
        for (const [oldName, newName] of entries) params.push(oldName, newName);
        const inList = entries.map(() => '?').join(', ');
        return db.prepare(`
          UPDATE ${table} SET ${column} = CASE ${column} ${caseParts} ELSE ${column} END
          WHERE userId = ? AND ${column} IN (${inList})
        `).run(...params, userId, ...entries.map(([oldName]) => oldName)).changes;
      };

      // 备份中的品牌 →（最终 id、最终名称）。无 ID 的旧格式品牌在这里预生成 id，
      // 插入时复用同一个 id，使"同名恢复"仍能把本地关联重新指向它，而不是当作品牌已删除。
      const payloadBrandIds: Array<string | null> = (Array.isArray(brands) ? brands : []).map((brand: ImportRow) => {
        if (!String(brand?.name ?? '').trim()) return null;
        const sourceId = brand?.id ? String(brand.id) : '';
        return sourceId ? (brandIdMap.get(sourceId) ?? uuidv4()) : uuidv4();
      });
      const payloadBrandsResolved: Array<{ id: string; name: string }> = (Array.isArray(brands) ? brands : [])
        .map((brand: ImportRow, index: number) => {
          const id = payloadBrandIds[index];
          const name = String(brand?.name ?? '').trim().slice(0, 50);
          return id && name ? { id, name } : null;
        })
        .filter((entry): entry is { id: string; name: string } => entry !== null);
      // 本地品牌 id → 备份中对应品牌的新 id（供"只恢复待办"等场景解析旧的品牌引用）
      const localBrandToNewId = new Map<string, string>();
      // "恢复后仍然存在"的品牌 id 集合：必须用最终 id（含无 ID 品牌预生成的那些），
      // 否则刚被重新指向的关联会被下面的悬空清理误判成孤儿。
      const survivingBrandIds = JSON.stringify(payloadBrandIds.filter((id): id is string => id !== null));

      const reconcileBrandReferences = () => {
        if (!replaced.has('brands')) return;
        const localBrands = db.prepare('SELECT id, name FROM brands WHERE userId = ?')
          .all(userId) as Array<{ id: string; name: string }>;
        if (localBrands.length === 0) return;

        const payloadNameById = new Map(payloadBrandsResolved.map(entry => [entry.id, entry.name]));
        const payloadIdByName = new Map<string, string>();
        for (const entry of payloadBrandsResolved) {
          if (!payloadIdByName.has(entry.name)) payloadIdByName.set(entry.name, entry.id);
        }

        // 先算名称映射（是否改名 / 是否删除），再按 id 修正引用：
        // 顺序反过来会让名称映射二次命中刚刚按 id 写好的新名字（甲↔乙 互换场景）。
        const nameMap = new Map<string, string | null>();
        const repointTodos = db.prepare('UPDATE todos SET brandId = ?, category = ? WHERE userId = ? AND brandId = ?');
        const repoints: Array<{ from: string; to: string; toName: string }> = [];

        for (const local of localBrands) {
          const sameIdTarget = brandIdMap.get(local.id);
          const sameIdName = sameIdTarget ? payloadNameById.get(sameIdTarget) : undefined;
          if (sameIdTarget && sameIdName) {
            if (sameIdName !== local.name) {
              nameMap.set(local.name, sameIdName);
              brandSync.renamed += 1;
            }
            if (sameIdTarget !== local.id) {
              repoints.push({ from: local.id, to: sameIdTarget, toName: sameIdName });
              brandSync.remapped += 1;
            }
            continue;
          }
          const sameNameTarget = payloadIdByName.get(local.name);
          if (sameNameTarget) {
            // 名称相同、ID 变化（含"无 ID 的旧品牌重新建立"）：关联仍然有效，只需指向新 ID
            repoints.push({ from: local.id, to: sameNameTarget, toName: local.name });
            brandSync.remapped += 1;
            continue;
          }
          // 品牌确实不在备份中：与手动删除品牌保持一致，清空依赖记录上的品牌标记
          nameMap.set(local.name, null);
          brandSync.removed += 1;
        }

        if (nameMap.size > 0) {
          for (const target of brandTextTargets) {
            brandSync.refsUpdated += applyBrandNameMap(target.table, target.column, nameMap);
          }
          brandSync.refsUpdated += applyBrandNameMap('todos', 'category', nameMap);
        }
        for (const repoint of repoints) {
          repointTodos.run(repoint.to, repoint.toName, userId, repoint.from);
          localBrandToNewId.set(repoint.from, repoint.to);
        }

        // 待办：指向"不在本次备份中的品牌"以及历史悬空引用，统一解除关联
        // （分类已在名称映射中处理：改名跟随、品牌删除则为空）
        orphaned.todoBrands += db.prepare(`
          UPDATE todos SET brandId = NULL
          WHERE userId = ? AND brandId IS NOT NULL AND brandId ${notSurviving}
        `).run(userId, survivingBrandIds).changes;
      };

      // 删除顺序保持子表在前，避免外键约束
      clearIfReplaced('comments', 'DELETE FROM comments WHERE userId = ?');
      clearIfReplaced('paidPromotions', 'DELETE FROM paid_promotions WHERE userId = ?');
      clearIfReplaced('publishLinks', 'DELETE FROM publish_links WHERE userId = ?');
      clearIfReplaced('activityLogs', 'DELETE FROM activity_logs WHERE userId = ?');
      clearIfReplaced('todos', 'DELETE FROM todos WHERE userId = ?');
      clearIfReplaced('payments', 'DELETE FROM payments WHERE userId = ?');
      clearIfReplaced('orderTemplates', 'DELETE FROM order_templates WHERE userId = ?');
      clearIfReplaced('assets', 'DELETE FROM assets WHERE userId = ?');
      // 必须在删除商单之前：先清理/解绑指向旧商单的记录
      detachOrderRelations();
      clearIfReplaced('orders', 'DELETE FROM orders WHERE userId = ?');
      // 必须在删除品牌之前：先按"改名同步 / 同 ID 重映射 / 删除清空"处理依赖记录
      reconcileBrandReferences();
      clearIfReplaced('brands', 'DELETE FROM brands WHERE userId = ?');

      if (Array.isArray(brands)) {
        const brandStmt = db.prepare(`
          INSERT INTO brands (id, userId, name, industry, contact, phone, contacts, totalOrders, totalIncome, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        brands.forEach((brand: ImportRow, brandIndex: number) => {
          const brandId = payloadBrandIds[brandIndex] ?? uuidv4();
          const contactsJson = brand.contacts
            ? (typeof brand.contacts === 'string' ? brand.contacts : JSON.stringify(brand.contacts))
            : (brand.contact || brand.phone ? JSON.stringify([{ id: uuidv4(), name: brand.contact || '', phone: brand.phone || '', note: '' }]) : null);
          brandStmt.run(
            brandId,
            userId,
            String(brand.name).slice(0, 50),
            clampText(brand.industry, 50),
            clampText(brand.contact, 50),
            clampText(brand.phone, 20),
            contactsJson,
            brand.totalOrders || 0,
            brand.totalIncome || 0,
            brand.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(orders)) {
        orders.forEach((order: ImportRow) => {
          const sourceOrderId = order.id ? String(order.id) : null;
          const sourceOrderNo = order.orderNo ? String(order.orderNo) : null;
          const orderId = insertImportedOrder(userId, {
            ...order,
            id: sourceOrderId ? orderIdMap.get(sourceOrderId) : uuidv4(),
            orderNo: sourceOrderNo ? orderNoMap.get(sourceOrderNo) : generateOrderNo(),
          }, { syncDerived: false, skipTodo: !preview.legacy });
          if (sourceOrderId) {
            orderIdMap.set(sourceOrderId, orderId);
          }
          importedOrderIds.add(orderId);
        });
      }

      if (Array.isArray(orderTemplates)) {
        const templateStmt = db.prepare(`
          INSERT INTO order_templates (
            id, userId, name, title, type, actualAmount, brandName, platforms,
            productName, productValue, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        orderTemplates.forEach((template: ImportRow) => {
          const rawPlatforms = Array.isArray(template.platforms)
            ? template.platforms
            : safeJsonParse(typeof template.platforms === 'string' ? template.platforms : null, []);
          const platforms = Array.from(new Set(
            rawPlatforms.map((platform: unknown) => String(platform).trim().slice(0, 30)).filter(Boolean),
          )).slice(0, 10);
          const templateType = asString(template.type);
          const type = ['paid', 'product_exchange', 'direct', 'ecard'].includes(templateType)
            ? templateType
            : 'paid';
          templateStmt.run(
            allocateImportedId('order_templates', userId, template.id),
            userId,
            String(template.name).trim().slice(0, 50),
            String(template.title).trim().slice(0, 100),
            type,
            (() => { const n = Number(template.actualAmount); return Number.isFinite(n) && n > 0 ? Math.min(n, 99999999) : 0; })(),
            String(template.brandName || '').trim().slice(0, 50) || null,
            JSON.stringify(platforms),
            String(template.productName || '').trim().slice(0, 100) || null,
            (() => { const n = Number(template.productValue); return Number.isFinite(n) && n > 0 ? Math.min(n, 99999999) : 0; })(),
            template.createdAt || new Date().toISOString(),
            template.updatedAt || template.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(todos)) {
        const todoStmt = db.prepare(`
          INSERT INTO todos (id, userId, content, priority, category, completed, dueDate, orderId, brandId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const brandExistsStmt = db.prepare('SELECT 1 FROM brands WHERE id = ? AND userId = ?');
        // 品牌关联统一解析：本次导入的品牌（可能被重新映射）→ 库里保留的品牌（例如只恢复待办）→ 解除关联。
        // 解除关联时"分类文本"必须一并清空：预检承诺的就是"分类同时清空"，
        // 否则会留下看似有品牌、实际没有关联的分类（与手动删除品牌的处理也不一致）。
        const resolveImportedBrand = (value: unknown): { brandId: string | null; dropped: boolean } => {
          if (value === undefined || value === null || value === '') return { brandId: null, dropped: false };
          const sourceId = String(value);
          const mapped = brandIdMap.get(sourceId);
          if (mapped) return { brandId: mapped, dropped: false };
          // 备份里没有同 ID 的品牌，但本地品牌被重新映射到备份中的同名品牌（含无 ID 的旧格式品牌）
          const remapped = localBrandToNewId.get(sourceId);
          if (remapped) return { brandId: remapped, dropped: false };
          if (brandExistsStmt.get(sourceId, userId)) return { brandId: sourceId, dropped: false };
          orphaned.todoBrands += 1;
          return { brandId: null, dropped: true };
        };
        todos.forEach((todo: ImportRow) => {
          const resolvedOrderId = resolveImportedOrderId(todo.orderId);
          if (todo.orderId && !resolvedOrderId) dropped.todos += 1;
          const resolvedBrand = resolveImportedBrand(todo.brandId);
          const todoContent = String(todo.content || '待办事项').trim().slice(0, 500) || '待办事项';
          // 旧版备份由恢复逻辑自动重建商单待办，这里跳过备份中的重复记录；
          // 版本化备份必须原样恢复（保留完成状态与原 ID），不能跳过。
          const isGeneratedOrderTodo = resolvedOrderId && String(todoContent).trim().startsWith('商单任务:');
          if (preview.legacy && isGeneratedOrderTodo) {
            return;
          }
          todoStmt.run(
            allocateImportedId('todos', userId, todo.id),
            userId,
            todoContent,
            ['high', 'medium', 'low'].includes(asString(todo.priority)) ? asString(todo.priority) : 'medium',
            resolvedBrand.dropped ? null : (todo.category ? String(todo.category).slice(0, 50) : null),
            todo.completed ? 1 : 0,
            asDateOnlyOrNull(todo.dueDate),
            resolvedOrderId,
            resolvedBrand.brandId,
            todo.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(payments)) {
        const paymentStmt = db.prepare(`
          INSERT INTO payments (id, userId, orderNo, brand, amount, type, date, dueDate, settledDate, method, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        payments.forEach((payment: ImportRow) => {
          const paymentId = allocateImportedId('payments', userId, payment.id);
          const rawAmount = Number(payment.amount ?? payment.actualAmount ?? 0);
          const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? Math.min(rawAmount, 99999999) : 0;
          // ISO 时间串按业务时区取日期，避免 UTC 截断导致差一天
          const createdDate = typeof payment.createdAt === 'string' && payment.createdAt
            ? formatLocalDate(new Date(payment.createdAt))
            : null;
          const type = normalizePaymentType(payment.type);
          const legacyDate = payment.date || createdDate;
          const dueDate = asDateOnlyOrNull(payment.dueDate) || (type === 'pending' ? asDateOnlyOrNull(legacyDate) : null);
          const settledDate = asDateOnlyOrNull(payment.settledDate) || (type === 'settled' ? asDateOnlyOrNull(legacyDate) : null);
          const compatibilityDate = type === 'settled' ? settledDate : dueDate;
          paymentStmt.run(
            paymentId,
            userId,
            resolveImportedOrderNo(payment.orderNo),
            clampText(payment.brand ?? payment.brandName, 50),
            amount,
            type,
            compatibilityDate,
            dueDate,
            settledDate,
            clampText(payment.method ?? payment.remark, 500),
            payment.createdAt || compatibilityDate || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(assets)) {
        const assetStmt = db.prepare(`
          INSERT INTO assets (id, userId, orderId, orderNo, brandName, productName, productValue, image, saleStatus, soldAmount, soldDate, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        assets.forEach((asset: ImportRow) => {
          const assetId = allocateImportedId('assets', userId, asset.id);
          const assetOrderId = resolveImportedOrderId(asset.orderId) || `imported-${assetId}`;
          assetStmt.run(
            assetId,
            userId,
            assetOrderId,
            resolveImportedOrderNo(asset.orderNo),
            asset.brandName ? String(asset.brandName).slice(0, 50) : (asset.brand ? String(asset.brand).slice(0, 50) : null),
            String(asset.productName || asset.name || '未知产品').slice(0, 100),
            (() => { const n = Number(asset.productValue ?? asset.value ?? 0); return Number.isFinite(n) && n > 0 ? Math.min(n, 99999999) : 0; })(),
            normalizeAssetImage(asset.image),
            normalizeSaleStatus(asset.saleStatus),
            (() => { const n = Number(asset.soldAmount ?? 0); return Number.isFinite(n) && n > 0 ? Math.min(n, 99999999) : 0; })(),
            asDateOnlyOrNull(asset.soldDate),
            asset.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(publishLinks)) {
        const linkStmt = db.prepare(`
          INSERT INTO publish_links (id, orderId, userId, platform, url, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        publishLinks.forEach((link: ImportRow) => {
          const resolvedOrderId = resolveImportedOrderId(link.orderId);
          if (!resolvedOrderId) { dropped.links += 1; return; }
          linkStmt.run(
            allocateImportedId('publish_links', userId, link.id),
            resolvedOrderId,
            userId,
            String(link.platform || '其他').slice(0, 30),
            normalizeLinkUrl(link.url) ?? '',
            link.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(paidPromotions)) {
        const promotionStmt = db.prepare(`
          INSERT INTO paid_promotions (id, orderId, userId, platform, amount, createdAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        paidPromotions.forEach((promotion: ImportRow) => {
          const resolvedOrderId = resolveImportedOrderId(promotion.orderId);
          if (!resolvedOrderId) { dropped.promotions += 1; return; }
          promotionStmt.run(
            allocateImportedId('paid_promotions', userId, promotion.id),
            resolvedOrderId,
            userId,
            String(promotion.platform || '其他').slice(0, 30),
            (() => { const n = Number(promotion.amount); return Number.isFinite(n) && n > 0 ? Math.min(n, 99999999) : 0; })(),
            promotion.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(comments)) {
        const commentStmt = db.prepare(`
          INSERT INTO comments (id, userId, orderId, content, createdAt)
          VALUES (?, ?, ?, ?, ?)
        `);
        comments.forEach((comment: ImportRow) => {
          const resolvedOrderId = resolveImportedOrderId(comment.orderId);
          if (!resolvedOrderId) { dropped.comments += 1; return; }
          commentStmt.run(
            allocateImportedId('comments', userId, comment.id),
            userId,
            resolvedOrderId,
            String(comment.content || '').slice(0, 2000),
            comment.createdAt || new Date().toISOString(),
          );
        });
      }

      if (Array.isArray(activityLogs)) {
        const logStmt = db.prepare(`
          INSERT INTO activity_logs (id, userId, action, entityType, entityId, details, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        activityLogs.forEach((log: ImportRow) => {
          logStmt.run(
            allocateImportedId('activity_logs', userId, log.id),
            userId,
            String(log.action || 'unknown').slice(0, 50),
            clampText(log.entityType, 50),
            clampText(log.entityId, 100),
            clampText(log.details, 1000),
            typeof log.createdAt === 'string' ? log.createdAt.slice(0, 40) : new Date().toISOString(),
          );
        });
      }

      // 外部 API 导出的 settings 是精简对象（只有 displayName/email/bio），
      // 恢复时缺失字段必须保留现有值而不是重置为默认
      if (importedSettings && typeof importedSettings === 'object' && !Array.isArray(importedSettings)) {
        const { displayName, bio, orderReminder, weeklyReport, avatar, apiKey, reportFrequency } = importedSettings;
        const normalizedOrderReminder = normalizeFlag(orderReminder);
        const normalizedWeeklyReport = normalizeFlag(weeklyReport);
        const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId) as { email?: string } | undefined;
        const existing = db.prepare('SELECT * FROM settings WHERE userId = ?').get(userId) as SettingsRow | undefined;
        const resolvedApiKey = typeof apiKey === 'string' && apiKey.trim() ? resolveImportedApiKey(userId, apiKey) : null;
        const resolvedReportFrequency = reportFrequency === 'monthly'
          ? 'monthly'
          : (reportFrequency === 'weekly' ? 'weekly' : (existing?.reportFrequency || 'weekly'));
        db.prepare(`
          UPDATE settings
          SET displayName = ?, email = ?, bio = ?, orderReminder = ?, weeklyReport = ?, avatar = ?,
              apiKey = COALESCE(?, apiKey), reportFrequency = ?
          WHERE userId = ?
        `).run(
          typeof displayName === 'string' && displayName.trim() ? displayName : (existing?.displayName || '博主账号'),
          user?.email || existing?.email || '',
          typeof bio === 'string' ? bio : (existing?.bio || ''),
          normalizedOrderReminder !== undefined ? (normalizedOrderReminder ? 1 : 0) : (existing?.orderReminder ?? 1),
          normalizedWeeklyReport !== undefined ? (normalizedWeeklyReport ? 1 : 0) : (existing?.weeklyReport ?? 0),
          typeof avatar === 'string' && avatar.trim() ? avatar : (existing?.avatar || ''),
          resolvedApiKey,
          resolvedReportFrequency,
          userId,
        );
      }

      // 完整备份恢复必须原样还原：备份中已包含恢复后的账单与资产（含用户独立修改的金额），
      // 重新同步派生数据会用商单金额覆盖这些记录。仅旧版备份（可能缺少派生数据）需要重建。
      if (preview.legacy && replaced.has('orders')) {
        const importedOrders = db.prepare('SELECT * FROM orders WHERE userId = ?').all(userId) as OrderRow[];
        importedOrders.forEach(order => syncOrderDerivedRecords(order, userId, operationDate));
      }
    });

    // 只恢复商单时会先删除旧行、再写入备份里的行；若存在"仍指向这些商单"的关联记录
    // （同 ID 覆盖是最常见的情形），外键校验会在删除瞬间直接报错、整次恢复失败。
    // 与 /clear 的处理一致：在事务外临时关闭外键校验，
    // 真正的孤儿由 detachOrderRelations() 负责清理/解绑，结束后数据依然一致。
    db.pragma('foreign_keys = OFF');
    try {
      importData();
    } finally {
      db.pragma('foreign_keys = ON');
    }
    return res.json({
      success: true,
      preview,
      replacedCollections: preview.collections,
      settingsOnly: preview.settingsOnly,
      // 关联记录处理结果：让调用方/界面能提示"哪些数据没能恢复"
      droppedRelations: dropped,
      // 被清理/解绑的本地孤儿记录（所属商单不在备份中）：评论/链接/推广已删除，待办/资产已解除关联
      orphanedRelations: orphaned,
      // 品牌关联的同步结果（改名同步 / 同 ID 重映射 / 删除清空依赖标记）
      brandChanges: brandSync,
    });
  } catch (error) {
    console.error('导入数据错误:', error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '导入数据失败，请稍后重试') });
  }
});

router.post('/orders', (req, res) => {
  try {
    const userId = getUserId(req);
    const { data } = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: '导入数据为空' });
    }

    const results = importOrderRows(userId, data, 1);
    logActivity(userId, 'import', 'order', 'batch', `批量导入商单: 成功${results.success}条，失败${results.failed}条`);
    return res.json(results);
  } catch (error) {
    console.error('批量导入商单错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: '批量导入商单失败，请稍后重试',
      timestamp: new Date().toISOString(),
    });
  }
});

router.post('/orders/file', upload.single('file'), async (req, res) => {
  let file: Express.Multer.File | undefined;
  try {
    const userId = getUserId(req);
    file = req.file;

    if (!file) {
      return res.status(400).json({ error: '请上传文件' });
    }

    const data = await parseUploadedOrderFile(file);
    if (data.length === 0) {
      return res.status(400).json({ error: '文件内容为空' });
    }

    const results = importOrderRows(userId, data, 2);
    logActivity(userId, 'import_file', 'order', 'batch', `文件导入商单: 成功${results.success}条，失败${results.failed}条`);
    return res.json(results);
  } catch (error) {
    console.error('文件导入商单错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: '文件解析失败，请检查文件格式' });
  } finally {
    if (file && fs.existsSync(file.path)) fs.unlinkSync(file.path);
  }
});

export default router;
