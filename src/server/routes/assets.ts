import { Router } from 'express';
import db from '../db.js';
import { logActivity, getUserId } from './utils/index.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const assets = db.prepare('SELECT * FROM assets WHERE userId = ? ORDER BY createdAt DESC').all(userId);
    return res.json(assets);
  } catch (error) {
    console.error('获取资产列表错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: '获取资产列表失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND userId = ?').get(id, userId);
    if (!asset) {
      return res.status(404).json({ error: '资产不存在' });
    }
    return res.json(asset);
  } catch (error) {
    console.error('获取资产详情错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: '获取资产详情失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.put('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { productName, productValue, image, saleStatus, soldAmount } = req.body;

    const existing = db.prepare('SELECT * FROM assets WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (!existing) {
      return res.status(404).json({ error: '资产不存在' });
    }

    const newProductName = productName !== undefined ? productName : existing.productName;
    const newProductValue = productValue !== undefined ? productValue : existing.productValue;
    const newImage = image !== undefined ? image : existing.image;
    const newSaleStatus = saleStatus !== undefined ? saleStatus : (existing.saleStatus || 'keep');
    const newSoldAmount = soldAmount !== undefined ? soldAmount : (existing.soldAmount || 0);

    let newSoldDate = existing.soldDate || null;
    if (saleStatus !== undefined && saleStatus !== existing.saleStatus) {
      if (saleStatus === 'sold') {
        newSoldDate = new Date().toISOString().split('T')[0];
      } else {
        newSoldDate = null;
      }
    }

    db.prepare(`
      UPDATE assets SET productName = ?, productValue = ?, image = ?, saleStatus = ?, soldAmount = ?, soldDate = ? WHERE id = ? AND userId = ?
    `).run(newProductName, newProductValue, newImage, newSaleStatus, newSoldAmount, newSoldDate, id, userId);

    if (saleStatus !== undefined && saleStatus !== existing.saleStatus && existing.brandName) {
      const brand = db.prepare('SELECT id, totalIncome FROM brands WHERE name = ? AND userId = ?').get(existing.brandName, userId) as any;
      if (brand) {
        if (saleStatus === 'sold') {
          db.prepare('UPDATE brands SET totalIncome = totalIncome + ? WHERE id = ?').run(newSoldAmount, brand.id);
        } else if (existing.saleStatus === 'sold') {
          db.prepare('UPDATE brands SET totalIncome = MAX(0, totalIncome - ?) WHERE id = ?').run(existing.soldAmount || 0, brand.id);
        }
      }
    }

    logActivity(userId, 'update', 'asset', id, `更新资产: ${newProductName}`);

    const updated = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
    return res.json(updated);
  } catch (error) {
    console.error('更新资产错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: '更新资产失败',
      timestamp: new Date().toISOString()
    });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const asset = db.prepare('SELECT * FROM assets WHERE id = ? AND userId = ?').get(id, userId) as any;
    if (!asset) {
      return res.status(404).json({ error: '资产不存在' });
    }

    if (asset.saleStatus === 'sold' && asset.soldAmount > 0 && asset.brandName) {
      const brand = db.prepare('SELECT id FROM brands WHERE name = ? AND userId = ?').get(asset.brandName, userId) as any;
      if (brand) {
        db.prepare('UPDATE brands SET totalIncome = MAX(0, totalIncome - ?) WHERE id = ?').run(asset.soldAmount, brand.id);
      }
    }

    db.prepare('DELETE FROM assets WHERE id = ? AND userId = ?').run(id, userId);
    logActivity(userId, 'delete', 'asset', id, `删除资产: ${asset.productName}`);

    return res.json({ success: true });
  } catch (error) {
    console.error('删除资产错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: '删除资产失败',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;