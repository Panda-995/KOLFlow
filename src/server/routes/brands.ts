import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logActivity, getUserId } from './utils/index.js';
import { validatePhone } from './utils/helpers.js';

const router = Router();

const parseBrandContacts = (brand: any) => {
  if (brand) {
    brand.contacts = brand.contacts ? JSON.parse(brand.contacts) : [];
    if (brand.contacts.length > 0) {
      brand.contact = brand.contact || brand.contacts[0].name;
      brand.phone = brand.phone || brand.contacts[0].phone;
    }
  }
  return brand;
};

// 获取所有品牌
router.get('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const brands = db.prepare('SELECT * FROM brands WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    res.json(brands.map(parseBrandContacts));
  } catch (error) {
    console.error('获取品牌列表错误:', error instanceof Error ? error.message : error);
    res.status(500).json({ 
      error: '获取品牌列表失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

// 获取单个品牌
router.get('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND userId = ?').get(id, userId);
    if (!brand) {
      return res.status(404).json({ error: '品牌不存在' });
    }
    return res.json(parseBrandContacts(brand));
  } catch (error) {
    console.error('获取品牌详情错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '获取品牌详情失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

// 创建品牌
router.post('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, industry, contact, phone, contacts } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: '品牌名称不能为空' });
    }
    if (name.length > 50) {
      return res.status(400).json({ error: '品牌名称不能超过50个字符' });
    }
    if (phone && !validatePhone(phone)) {
      return res.status(400).json({ error: '请输入有效的电话号码' });
    }

    const existingBrand = db.prepare('SELECT * FROM brands WHERE name = ? AND userId = ?').get(name.trim(), userId) as any;
    if (existingBrand) {
      return res.status(400).json({ error: '该品牌已存在' });
    }

    const contactsJson = contacts && contacts.length > 0
      ? JSON.stringify(contacts)
      : (contact || phone ? JSON.stringify([{ id: uuidv4(), name: contact || '', phone: phone || '', note: '' }]) : null);

    const id = uuidv4();
    db.prepare(`
      INSERT INTO brands (id, userId, name, industry, contact, phone, contacts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, name.trim(), industry || null, contact || null, phone || null, contactsJson);

    logActivity(userId, 'create', 'brand', id, `创建品牌: ${name}`);

    const newBrand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id);
    return res.json(parseBrandContacts(newBrand));
  } catch (error) {
    console.error('创建品牌错误:', error);
    return res.status(500).json({ error: '创建品牌失败，请稍后重试' });
  }
});

// 更新品牌
router.put('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { name, industry, contact, phone, contacts } = req.body;

    const existingBrand = db.prepare('SELECT * FROM brands WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (!existingBrand) {
      return res.status(404).json({ error: '品牌不存在' });
    }

    const newName = name !== undefined ? name : existingBrand.name;
    const newIndustry = industry !== undefined ? industry : existingBrand.industry;
    const newContact = contact !== undefined ? contact : existingBrand.contact;
    const newPhone = phone !== undefined ? phone : existingBrand.phone;
    const newContacts = contacts !== undefined
      ? (contacts.length > 0 ? JSON.stringify(contacts) : null)
      : existingBrand.contacts;

    db.prepare(`
      UPDATE brands
      SET name = ?, industry = ?, contact = ?, phone = ?, contacts = ?
      WHERE id = ?
    `).run(newName, newIndustry, newContact, newPhone, newContacts, id);

    if (name && name !== existingBrand.name) {
      logActivity(userId, 'update_name', 'brand', id, `品牌名称修改: ${existingBrand.name} → ${newName}`);
    } else {
      logActivity(userId, 'update', 'brand', id, `更新品牌信息: ${newName}`);
    }

    const updatedBrand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id);
    return res.json(parseBrandContacts(updatedBrand));
  } catch (error) {
    console.error('更新品牌错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '更新品牌失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const brand = db.prepare('SELECT name FROM brands WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (!brand) {
      return res.status(404).json({ error: '品牌不存在' });
    }

    logActivity(userId, 'delete', 'brand', id, `删除品牌: ${brand.name}`);

    // 使用事务确保一致性
    const deleteBrand = db.transaction(() => {
      // 更新订单的品牌引用
      db.prepare('UPDATE orders SET brandName = NULL WHERE brandName = ? AND userId = ?').run(brand.name, userId);
      
      // 更新所有相关待办：同时清除brandId和category
      db.prepare('UPDATE todos SET category = NULL, brandId = NULL WHERE (brandId = ? OR category = ?) AND userId = ?').run(id, brand.name, userId);
      
      // 更新payments的品牌引用
      db.prepare('UPDATE payments SET brand = NULL WHERE brand = ? AND userId = ?').run(brand.name, userId);
      db.prepare('UPDATE assets SET brandName = NULL WHERE brandName = ? AND userId = ?').run(brand.name, userId);
      
      // 删除品牌
      db.prepare('DELETE FROM brands WHERE id = ? AND userId = ?').run(id, userId);
    });

    deleteBrand();

    return res.json({ success: true });
  } catch (error) {
    console.error('删除品牌错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({ 
      error: '删除品牌失败，请稍后重试',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
