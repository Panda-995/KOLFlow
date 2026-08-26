import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { formatLocalDate, isValidDateOnly, safeJsonParse, validateAmount } from '../routes/utils/helpers.js';
import { logActivity } from '../routes/utils/index.js';
import { createOrderWithTodo } from './orderService.js';

const ORDER_TYPES = new Set(['paid', 'product_exchange', 'direct', 'ecard']);

interface OrderTemplateInput {
  name: string;
  title: string;
  type?: string;
  actualAmount?: number;
  brandName?: string | null;
  platforms?: string[];
  productName?: string | null;
  productValue?: number;
}

type OrderTemplateUpdate = Partial<OrderTemplateInput>;

interface OrderTemplateRow {
  id: string;
  userId: string;
  name: string;
  title: string;
  type: string;
  actualAmount: number;
  brandName: string | null;
  platforms: string | string[] | null;
  productName: string | null;
  productValue: number;
  createdAt?: string;
  updatedAt?: string;
}

const toNumber = (value: unknown): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : Number.NaN;
};

const parseTemplateForClient = (template: OrderTemplateRow | undefined) => {
  if (!template) return template;
  return {
    ...template,
    actualAmount: Number(template.actualAmount) || 0,
    productValue: Number(template.productValue) || 0,
    platforms: Array.isArray(template.platforms)
      ? template.platforms
      : safeJsonParse(template.platforms, []),
  };
};

const normalizePlatforms = (value: unknown): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error('发布平台格式无效');
  const platforms = Array.from(new Set(value.map(item => String(item).trim()).filter(Boolean)));
  if (platforms.length > 10) throw new Error('平台数量不能超过10个');
  return platforms;
};

const validateTemplate = (template: OrderTemplateInput): Required<Omit<OrderTemplateInput, 'brandName' | 'productName'>> & {
  brandName: string | null;
  productName: string | null;
} => {
  const name = String(template.name || '').trim();
  const title = String(template.title || '').trim();
  const type = template.type || 'paid';
  const actualAmount = toNumber(template.actualAmount);
  const productValue = toNumber(template.productValue);
  const brandName = template.brandName?.trim() || null;
  const productName = template.productName?.trim() || null;

  if (!name) throw new Error('模板名称不能为空');
  if (name.length > 50) throw new Error('模板名称不能超过50个字符');
  if (!title) throw new Error('商单标题不能为空');
  if (title.length > 100) throw new Error('商单标题不能超过100个字符');
  if (!ORDER_TYPES.has(type)) throw new Error('合作类型无效');
  if (!validateAmount(actualAmount) || !validateAmount(productValue)) throw new Error('金额数值无效');
  if (brandName && brandName.length > 50) throw new Error('品牌名称不能超过50个字符');
  if (productName && productName.length > 100) throw new Error('产品名称不能超过100个字符');

  return {
    name,
    title,
    type,
    actualAmount,
    brandName,
    platforms: normalizePlatforms(template.platforms),
    productName,
    productValue,
  };
};

const ensureTemplateNameAvailable = (userId: string, name: string, excludedId?: string): void => {
  const duplicate = excludedId
    ? db.prepare('SELECT 1 FROM order_templates WHERE userId = ? AND name = ? COLLATE NOCASE AND id <> ?').get(userId, name, excludedId)
    : db.prepare('SELECT 1 FROM order_templates WHERE userId = ? AND name = ? COLLATE NOCASE').get(userId, name);
  if (duplicate) throw new Error('模板名称已存在');
};

export const listOrderTemplates = (userId: string) => {
  const templates = db.prepare(`
    SELECT * FROM order_templates
    WHERE userId = ?
    ORDER BY updatedAt DESC, createdAt DESC
  `).all(userId) as OrderTemplateRow[];
  return templates.map(parseTemplateForClient);
};

export const createOrderTemplate = (userId: string, input: OrderTemplateInput) => {
  const template = validateTemplate(input);
  ensureTemplateNameAvailable(userId, template.name);
  const id = uuidv4();
  db.prepare(`
    INSERT INTO order_templates (
      id, userId, name, title, type, actualAmount, brandName, platforms, productName, productValue
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    template.name,
    template.title,
    template.type,
    template.actualAmount,
    template.brandName,
    JSON.stringify(template.platforms),
    template.productName,
    template.productValue,
  );
  logActivity(userId, 'create', 'order_template', id, `创建商单模板: ${template.name}`);
  return parseTemplateForClient(db.prepare('SELECT * FROM order_templates WHERE id = ? AND userId = ?').get(id, userId) as OrderTemplateRow);
};

export const updateOrderTemplate = (userId: string, templateId: string, input: OrderTemplateUpdate) => {
  const existing = db.prepare('SELECT * FROM order_templates WHERE id = ? AND userId = ?').get(templateId, userId) as OrderTemplateRow | undefined;
  if (!existing) throw new Error('商单模板不存在');

  const template = validateTemplate({
    name: input.name ?? existing.name,
    title: input.title ?? existing.title,
    type: input.type ?? existing.type,
    actualAmount: input.actualAmount ?? existing.actualAmount,
    brandName: input.brandName !== undefined ? input.brandName : existing.brandName,
    platforms: input.platforms ?? (
      Array.isArray(existing.platforms) ? existing.platforms : safeJsonParse(existing.platforms, [])
    ),
    productName: input.productName !== undefined ? input.productName : existing.productName,
    productValue: input.productValue ?? existing.productValue,
  });
  ensureTemplateNameAvailable(userId, template.name, templateId);

  db.prepare(`
    UPDATE order_templates
    SET name = ?, title = ?, type = ?, actualAmount = ?, brandName = ?, platforms = ?,
        productName = ?, productValue = ?, updatedAt = CURRENT_TIMESTAMP
    WHERE id = ? AND userId = ?
  `).run(
    template.name,
    template.title,
    template.type,
    template.actualAmount,
    template.brandName,
    JSON.stringify(template.platforms),
    template.productName,
    template.productValue,
    templateId,
    userId,
  );
  logActivity(userId, 'update', 'order_template', templateId, `更新商单模板: ${template.name}`);
  return parseTemplateForClient(db.prepare('SELECT * FROM order_templates WHERE id = ? AND userId = ?').get(templateId, userId) as OrderTemplateRow);
};

export const deleteOrderTemplate = (userId: string, templateId: string) => {
  const template = db.prepare('SELECT name FROM order_templates WHERE id = ? AND userId = ?').get(templateId, userId) as { name: string } | undefined;
  if (!template) throw new Error('商单模板不存在');
  db.prepare('DELETE FROM order_templates WHERE id = ? AND userId = ?').run(templateId, userId);
  logActivity(userId, 'delete', 'order_template', templateId, `删除商单模板: ${template.name}`);
  return { success: true };
};

export const createOrderFromTemplate = (userId: string, templateId: string, operationDate?: unknown) => {
  const template = db.prepare('SELECT * FROM order_templates WHERE id = ? AND userId = ?').get(templateId, userId) as OrderTemplateRow | undefined;
  if (!template) throw new Error('商单模板不存在');
  if (operationDate !== undefined && operationDate !== null && operationDate !== '' && !isValidDateOnly(operationDate)) {
    throw new Error('操作日期无效');
  }
  const acceptDate = typeof operationDate === 'string' && operationDate ? operationDate : formatLocalDate();
  const platforms = Array.isArray(template.platforms)
    ? template.platforms
    : safeJsonParse<string[]>(template.platforms, []);
  const order = createOrderWithTodo(userId, {
    title: template.title,
    type: template.type,
    status: 'in_progress',
    actualAmount: template.actualAmount,
    brandName: template.brandName,
    platforms,
    acceptDate,
    submitDate: null,
    productName: template.productName,
    productValue: template.productValue,
    operationDate: acceptDate,
  });
  logActivity(userId, 'instantiate', 'order_template', templateId, `从模板创建商单: ${template.name}`);
  return order;
};
