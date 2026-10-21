import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2 } from 'lucide-react';
import type { OrderProduct } from '../../types';

export type ProductFormItem = { id: string; productName: string; productValue: string };
export const emptyProduct = (): ProductFormItem => ({ id: uuidv4(), productName: '', productValue: '' });
export const productsToForm = (products: OrderProduct[]): ProductFormItem[] => products.length
  ? products.map(product => ({ ...product, productValue: String(product.productValue || '') }))
  : [emptyProduct()];

export default function ProductFields({ products, onChange, prefix }: {
  products: ProductFormItem[];
  onChange: (products: ProductFormItem[]) => void;
  prefix: string;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-medium text-gray-700 mb-2">赠送产品</legend>
      {products.map((product, index) => (
        <div key={product.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px] gap-2 items-end">
          <div>
            <label htmlFor={`${prefix}-name-${index}`} className="block text-xs text-gray-700 mb-1">产品名称 {index + 1}</label>
            <input id={`${prefix}-name-${index}`} required maxLength={100} value={product.productName}
              onChange={event => onChange(products.map(item => item.id === product.id ? { ...item, productName: event.target.value } : item))}
              className="w-full form-control" />
          </div>
          <div>
            <label htmlFor={`${prefix}-value-${index}`} className="block text-xs text-gray-700 mb-1">产品价值 {index + 1} (¥)</label>
            <input id={`${prefix}-value-${index}`} type="number" min="0" max="99999999" step="0.01" inputMode="decimal" value={product.productValue}
              onChange={event => onChange(products.map(item => item.id === product.id ? { ...item, productValue: event.target.value } : item))}
              className="w-full form-control" />
          </div>
          <button type="button" aria-label={`移除产品 ${index + 1}`} disabled={products.length <= 1}
            onClick={() => onChange(products.filter(item => item.id !== product.id))}
            className="h-10 rounded-lg text-danger hover:bg-danger/10 disabled:opacity-30 flex items-center justify-center">
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button type="button" disabled={products.length >= 50} onClick={() => onChange([...products, emptyProduct()])}
        className="btn-secondary min-h-10 px-3 text-xs inline-flex items-center gap-1 disabled:opacity-50">
        <Plus size={14} />添加产品
      </button>
    </fieldset>
  );
}
