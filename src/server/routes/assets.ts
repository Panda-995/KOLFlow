import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logActivity, getUserId } from './utils/index.js';
import { validateAmount } from './utils/helpers.js';

const router = Router();

const generateAssetNo = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = uuidv4().slice(0, 6);
  return `ASSET-${year}${month}${day}-${random}`;
};

const getAssetIncome = (asset: { saleStatus?: string | null; soldAmount?: number | null }): number => {
  if (asset.saleStatus !== 'sold') return 0;
  return Number(asset.soldAmount) || 0;
};

const adjustBrandIncome = (userId: string, brandName: string | null | undefined, delta: number) => {
  if (!brandName || delta === 0) return;
  const brand = db.prepare('SELECT id FROM brands WHERE name = ? AND userId = ?').get(brandName, userId) as any;
  if (!brand) return;
  db.prepare('UPDATE brands SET totalIncome = MAX(0, totalIncome + ?) WHERE id = ?').run(delta, brand.id);
};

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

router.post('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const { brandName, productName, productValue, image, saleStatus, soldAmount } = req.body;

    if (!productName || productName.trim().length === 0) {
      return res.status(400).json({ error: '资产名称不能为空' });
    }

    if (!validateAmount(productValue) || !validateAmount(soldAmount)) {
      return res.status(400).json({ error: '金额数值无效' });
    }

    const id = uuidv4();
    const normalizedSaleStatus = saleStatus === 'sold' ? 'sold' : 'keep';
    const normalizedSoldAmount = normalizedSaleStatus === 'sold' ? (Number(soldAmount) || 0) : 0;
    const soldDate = normalizedSaleStatus === 'sold' ? new Date().toISOString().split('T')[0] : null;

    const createAsset = db.transaction(() => {
      db.prepare(`
        INSERT INTO assets (id, userId, orderId, orderNo, brandName, productName, productValue, image, saleStatus, soldAmount, soldDate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        userId,
        `manual-${id}`,
        generateAssetNo(),
        brandName?.trim() || null,
        productName.trim(),
        Number(productValue) || 0,
        image || null,
        normalizedSaleStatus,
        normalizedSoldAmount,
        soldDate
      );

      adjustBrandIncome(userId, brandName?.trim(), normalizedSoldAmount);
      logActivity(userId, 'create', 'asset', id, `手动创建资产: ${productName.trim()}`);

      return db.prepare('SELECT * FROM assets WHERE id = ? AND userId = ?').get(id, userId);
    });

    const created = createAsset();
    return res.json(created);
  } catch (error) {
    console.error('创建资产错误:', error instanceof Error ? error.message : error);
    return res.status(500).json({
      error: '创建资产失败',
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

    const updateAsset = db.transaction(() => {
      db.prepare(`
        UPDATE assets SET productName = ?, productValue = ?, image = ?, saleStatus = ?, soldAmount = ?, soldDate = ? WHERE id = ? AND userId = ?
      `).run(newProductName, newProductValue, newImage, newSaleStatus, newSoldAmount, newSoldDate, id, userId);

      const oldIncome = getAssetIncome(existing);
      const newIncome = getAssetIncome({ saleStatus: newSaleStatus, soldAmount: newSoldAmount });
      adjustBrandIncome(userId, existing.brandName, newIncome - oldIncome);

      logActivity(userId, 'update', 'asset', id, `更新资产: ${newProductName}`);

      return db.prepare('SELECT * FROM assets WHERE id = ? AND userId = ?').get(id, userId);
    });

    const updated = updateAsset();
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

    const deleteAsset = db.transaction(() => {
      adjustBrandIncome(userId, asset.brandName, -getAssetIncome(asset));
      db.prepare('DELETE FROM assets WHERE id = ? AND userId = ?').run(id, userId);
      logActivity(userId, 'delete', 'asset', id, `删除资产: ${asset.productName}`);
    });

    deleteAsset();

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
