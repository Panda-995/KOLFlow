import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logActivity, getUserId } from './utils/index.js';
import { validatePhone } from './utils/helpers.js';

const router = Router();

// 获取所有品牌
router.get('/', (req, res) => {
  const userId = getUserId(req);
  const brands = db.prepare('SELECT * FROM brands WHERE userId = ? ORDER BY createdAt DESC').all(userId);
  res.json(brands);
});

// 获取单个品牌
router.get('/:id', (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const brand = db.prepare('SELECT * FROM brands WHERE id = ? AND userId = ?').get(id, userId);
  if (!brand) {
    return res.status(404).json({ error: '品牌不存在' });
  }
  res.json(brand);
});

// 创建品牌
router.post('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, industry, contact, phone } = req.body;

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

    const id = uuidv4();
    db.prepare(`
      INSERT INTO brands (id, userId, name, industry, contact, phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, userId, name.trim(), industry || null, contact || null, phone || null);

    logActivity(userId, 'create', 'brand', id, `创建品牌: ${name}`);

    const newBrand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id);
    res.json(newBrand);
  } catch (error) {
    console.error('创建品牌错误:', error);
    res.status(500).json({ error: '创建品牌失败，请稍后重试' });
  }
});

// 更新品牌
router.put('/:id', (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const { name, industry, contact, phone } = req.body;

  const existingBrand = db.prepare('SELECT * FROM brands WHERE id = ? AND userId = ?').get(id, userId) as any;
  if (!existingBrand) {
    return res.status(404).json({ error: '品牌不存在' });
  }

  const newName = name || existingBrand.name;
  const newIndustry = industry || existingBrand.industry;
  const newContact = contact || existingBrand.contact;
  const newPhone = phone || existingBrand.phone;

  db.prepare(`
    UPDATE brands
    SET name = ?, industry = ?, contact = ?, phone = ?
    WHERE id = ?
  `).run(newName, newIndustry, newContact, newPhone, id);

  if (name && name !== existingBrand.name) {
    logActivity(userId, 'update_name', 'brand', id, `品牌名称修改: ${existingBrand.name} → ${newName}`);
  } else {
    logActivity(userId, 'update', 'brand', id, `更新品牌信息: ${newName}`);
  }

  const updatedBrand = db.prepare('SELECT * FROM brands WHERE id = ?').get(id);
  res.json(updatedBrand);
});

router.delete('/:id', (req, res) => {
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
    db.prepare('UPDATE payments SET brand = ? WHERE brand = ? AND userId = ?').run(`已删除品牌(${brand.name})`, brand.name, userId);
    
    // 删除品牌
    db.prepare('DELETE FROM brands WHERE id = ? AND userId = ?').run(id, userId);
  });

  deleteBrand();
  
  res.json({ success: true });
});

export default router;