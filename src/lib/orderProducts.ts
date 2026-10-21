import { v4 as uuidv4 } from 'uuid';
import type { OrderProduct } from '../types/index.js';

export const hasOrderProducts = (type: string): boolean => type === 'product_exchange' || type === 'paid_product';

type ProductSource = { type?: string; products?: unknown; productName?: string | null; productValue?: number | null };

// Null means a pre-migration record. Keep its stable identity when it is edited.
export const getOrderProducts = (source: ProductSource): OrderProduct[] => {
  if (!hasOrderProducts(source.type || '')) return [];
  if (Array.isArray(source.products)) return source.products as OrderProduct[];
  if (typeof source.products === 'string') {
    try {
      const parsed: unknown = JSON.parse(source.products);
      if (Array.isArray(parsed)) return parsed as OrderProduct[];
    } catch { /* Fall back to the legacy fields. */ }
  }
  return [{ id: 'legacy-product', productName: source.productName || '', productValue: source.productValue || 0 }];
};

export const validateOrderProducts = (value: unknown): OrderProduct[] => {
  let input = value;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { throw new Error('产品列表格式无效'); }
  }
  if (!Array.isArray(input) || input.length > 50) throw new Error('产品列表格式无效，最多添加50件产品');
  const ids = new Set<string>();
  return input.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('产品格式无效');
    const product = item as Record<string, unknown>;
    const id = product.id === undefined ? uuidv4() : product.id;
    if (typeof id !== 'string' || !id || id.length > 100 || ids.has(id)) throw new Error('产品标识无效或重复');
    ids.add(id);
    if (typeof product.productName !== 'string' || !product.productName.trim() || product.productName.trim().length > 100) {
      throw new Error('产品名称不能为空且不能超过100个字符');
    }
    const productValue = Number(product.productValue ?? 0);
    if (!Number.isFinite(productValue) || productValue < 0 || productValue > 99999999) throw new Error('产品金额数值无效');
    return { id, productName: product.productName.trim(), productValue };
  });
};

export const summarizeProducts = (products: OrderProduct[]) => ({
  productName: products.map(product => product.productName).join('、'),
  productValue: products.reduce((total, product) => total + Math.round(product.productValue * 100), 0) / 100,
});
