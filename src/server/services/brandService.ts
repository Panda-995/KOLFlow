import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { logActivity } from '../routes/utils/index.js';
import { safeJsonParse, validatePhone } from '../routes/utils/helpers.js';
import { ApiError } from './errors.js';

type BrandContactInput = {
  id?: unknown;
  name?: unknown;
  phone?: unknown;
  note?: unknown;
};

export type BrandInput = {
  name?: unknown;
  industry?: unknown;
  contact?: unknown;
  phone?: unknown;
  contacts?: unknown;
};

type BrandRow = {
  id: string;
  userId: string;
  name: string;
  industry: string | null;
  contact: string | null;
  phone: string | null;
  contacts: string | null;
  [key: string]: unknown;
};

const normalizeOptionalText = (value: unknown, field: string, maxLength: number): string | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(`${field}格式无效`);
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ApiError(`${field}不能超过${maxLength}个字符`);
  return normalized || null;
};

const normalizeContacts = (contacts: unknown): Array<{ id: string; name: string; phone: string; note: string }> => {
  if (!Array.isArray(contacts)) throw new ApiError('联系人格式无效');
  if (contacts.length > 50) throw new ApiError('联系人数量不能超过50个');

  return contacts.map((rawContact, index) => {
    if (!rawContact || typeof rawContact !== 'object') throw new ApiError(`第${index + 1}个联系人格式无效`);
    const contact = rawContact as BrandContactInput;
    const name = normalizeOptionalText(contact.name, '联系人姓名', 50) || '';
    const phone = normalizeOptionalText(contact.phone, '联系人电话', 20) || '';
    const note = normalizeOptionalText(contact.note, '联系人备注', 200) || '';
    if (phone && !validatePhone(phone)) throw new ApiError(`第${index + 1}个联系人电话格式无效`);
    return {
      id: typeof contact.id === 'string' && contact.id.trim() ? contact.id : uuidv4(),
      name,
      phone,
      note,
    };
  });
};

export const parseBrandForClient = (brand: BrandRow | undefined): any => {
  if (!brand) return brand;
  const contacts = safeJsonParse<unknown>(brand.contacts, []);
  const normalizedContacts = Array.isArray(contacts) ? contacts : [];
  const firstContact = normalizedContacts[0] as { name?: string; phone?: string } | undefined;
  return {
    ...brand,
    contacts: normalizedContacts,
    contact: brand.contact || firstContact?.name || '',
    phone: brand.phone || firstContact?.phone || '',
  };
};

const normalizeBrandValues = (input: BrandInput, existing?: BrandRow) => {
  const rawName = input.name !== undefined ? input.name : existing?.name;
  if (typeof rawName !== 'string' || !rawName.trim()) throw new ApiError('品牌名称不能为空');
  const name = rawName.trim();
  if (name.length > 50) throw new ApiError('品牌名称不能超过50个字符');

  const industry = input.industry !== undefined
    ? normalizeOptionalText(input.industry, '行业', 50)
    : existing?.industry || null;
  const contact = input.contact !== undefined
    ? normalizeOptionalText(input.contact, '联系人', 50)
    : existing?.contact || null;
  const phone = input.phone !== undefined
    ? normalizeOptionalText(input.phone, '联系电话', 20)
    : existing?.phone || null;
  if (phone && !validatePhone(phone)) throw new ApiError('请输入有效的电话号码');

  let contactsJson = existing?.contacts || null;
  if (input.contacts !== undefined) {
    const contacts = normalizeContacts(input.contacts);
    contactsJson = contacts.length ? JSON.stringify(contacts) : null;
  } else if (!existing && (contact || phone)) {
    contactsJson = JSON.stringify([{ id: uuidv4(), name: contact || '', phone: phone || '', note: '' }]);
  }

  return { name, industry, contact, phone, contactsJson };
};

const ensureBrandNameAvailable = (userId: string, name: string, excludedId?: string) => {
  const duplicate = excludedId
    ? db.prepare('SELECT id FROM brands WHERE userId = ? AND name = ? COLLATE NOCASE AND id <> ?').get(userId, name, excludedId)
    : db.prepare('SELECT id FROM brands WHERE userId = ? AND name = ? COLLATE NOCASE').get(userId, name);
  if (duplicate) throw new ApiError('该品牌已存在');
};

export const listBrands = (userId: string) => (
  (db.prepare('SELECT * FROM brands WHERE userId = ? ORDER BY createdAt DESC').all(userId) as BrandRow[])
    .map(brand => parseBrandForClient(brand))
);

export const getBrand = (userId: string, id: string) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND userId = ?').get(id, userId) as BrandRow | undefined;
  if (!brand) throw new ApiError('品牌不存在', 404);
  return parseBrandForClient(brand);
};

export const createBrand = (userId: string, input: BrandInput) => {
  const values = normalizeBrandValues(input);
  ensureBrandNameAvailable(userId, values.name);
  const id = uuidv4();
  db.prepare(`
    INSERT INTO brands (id, userId, name, industry, contact, phone, contacts)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, values.name, values.industry, values.contact, values.phone, values.contactsJson);
  logActivity(userId, 'create', 'brand', id, `创建品牌: ${values.name}`);
  return getBrand(userId, id);
};

export const updateBrand = (userId: string, id: string, input: BrandInput) => {
  const existing = db.prepare('SELECT * FROM brands WHERE id = ? AND userId = ?').get(id, userId) as BrandRow | undefined;
  if (!existing) throw new ApiError('品牌不存在', 404);
  const values = normalizeBrandValues(input, existing);
  ensureBrandNameAvailable(userId, values.name, id);

  const update = db.transaction(() => {
    if (values.name !== existing.name) {
      db.prepare('UPDATE orders SET brandName = ? WHERE brandName = ? AND userId = ?').run(values.name, existing.name, userId);
      db.prepare(`
        UPDATE todos SET category = ?, brandId = ?
        WHERE userId = ? AND (brandId = ? OR category = ?)
      `).run(values.name, id, userId, id, existing.name);
      db.prepare('UPDATE payments SET brand = ? WHERE brand = ? AND userId = ?').run(values.name, existing.name, userId);
      db.prepare('UPDATE assets SET brandName = ? WHERE brandName = ? AND userId = ?').run(values.name, existing.name, userId);
    }

    db.prepare(`
      UPDATE brands
      SET name = ?, industry = ?, contact = ?, phone = ?, contacts = ?
      WHERE id = ? AND userId = ?
    `).run(values.name, values.industry, values.contact, values.phone, values.contactsJson, id, userId);

    logActivity(
      userId,
      values.name !== existing.name ? 'update_name' : 'update',
      'brand',
      id,
      values.name !== existing.name
        ? `品牌名称修改: ${existing.name} → ${values.name}`
        : `更新品牌信息: ${values.name}`,
    );
  });

  update();
  return getBrand(userId, id);
};

export const deleteBrand = (userId: string, id: string) => {
  const existing = db.prepare('SELECT name FROM brands WHERE id = ? AND userId = ?').get(id, userId) as { name: string } | undefined;
  if (!existing) throw new ApiError('品牌不存在', 404);

  const remove = db.transaction(() => {
    db.prepare('UPDATE orders SET brandName = NULL WHERE brandName = ? AND userId = ?').run(existing.name, userId);
    db.prepare('UPDATE todos SET category = NULL, brandId = NULL WHERE (brandId = ? OR category = ?) AND userId = ?').run(id, existing.name, userId);
    db.prepare('UPDATE payments SET brand = NULL WHERE brand = ? AND userId = ?').run(existing.name, userId);
    db.prepare('UPDATE assets SET brandName = NULL WHERE brandName = ? AND userId = ?').run(existing.name, userId);
    db.prepare('DELETE FROM brands WHERE id = ? AND userId = ?').run(id, userId);
    logActivity(userId, 'delete', 'brand', id, `删除品牌: ${existing.name}`);
  });
  remove();
  return { success: true };
};
