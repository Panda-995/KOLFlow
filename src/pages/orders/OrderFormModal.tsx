import ProductFields, { productsToForm, type ProductFormItem } from '../../components/orders/ProductFields';
import { getOrderProducts, hasOrderProducts, summarizeProducts } from '../../lib/orderProducts';
import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import Select from '../../components/common/Select';
import { useToast } from '../../components/Toast';
import type { Brand, Order, OrderStatus, OrderType, OrderProduct } from '../../types';

export interface OrderFormPayload {
  title: string;
  brandName: string;
  type: OrderType;
  status: OrderStatus;
  actualAmount: number;
  productValue: number;
  platforms: string[];
  acceptDate: string;
  submitDate: string;
  productName: string;
  products: OrderProduct[];
}

const EMPTY_FORM = {
  title: '',
  brandName: '',
  type: 'paid' as OrderType,
  status: 'in_progress' as OrderStatus,
  actualAmount: '',
  platforms: '',
  acceptDate: '',
  submitDate: '',
  productName: '',
  productValue: '',
  products: [] as ProductFormItem[]
};

interface OrderFormModalProps {
  isOpen: boolean;
  editingOrder: Order | null;
  brands: Brand[];
  onClose: () => void;
  onSubmit: (payload: OrderFormPayload) => Promise<void>;
}

// 新建/编辑商单表单：表单状态、预填与提交锁定内聚在组件内，
// 提交结果（含创建品牌、调用接口）由父级通过 onSubmit 处理。
export default function OrderFormModal({ isOpen, editingOrder, brands, onClose, onSubmit }: OrderFormModalProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editingOrder) {
      setFormData({
        title: editingOrder.title,
        brandName: editingOrder.brandName,
        type: editingOrder.type,
        status: editingOrder.status,
        actualAmount: editingOrder.actualAmount.toString(),
        platforms: editingOrder.platforms.join(', '),
        acceptDate: editingOrder.acceptDate || '',
        submitDate: editingOrder.submitDate || '',
        productName: editingOrder.productName || '',
        productValue: editingOrder.productValue?.toString() || '',
        products: productsToForm(getOrderProducts(editingOrder))
      });
    } else {
      setFormData({ ...EMPTY_FORM, products: productsToForm([]) });
    }
  }, [isOpen, editingOrder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const products = hasOrderProducts(formData.type) ? formData.products.map(product => ({ ...product, productValue: Number(product.productValue) || 0 })) : [];
      await onSubmit({
        ...formData,
        actualAmount: formData.type === 'product_exchange' || formData.type === 'ecard' ? 0 : Number(formData.actualAmount) || 0,
        productName: hasOrderProducts(formData.type) ? summarizeProducts(products).productName : '',
        productValue: hasOrderProducts(formData.type) ? summarizeProducts(products).productValue : formData.type === 'ecard' ? Number(formData.productValue) || 0 : 0,
        products,
        platforms: formData.platforms.split(',').map(s => s.trim()).filter(Boolean)
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingOrder ? "编辑商单" : "新建商单"}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="order-title" className="block text-xs font-medium text-gray-700 mb-1">商单标题</label>
            <input id="order-title" required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full form-control" />
          </div>
          <div>
            <label htmlFor="order-brand" className="block text-xs font-medium text-gray-700 mb-1">合作品牌</label>
            <input
              id="order-brand"
              required
              type="text"
              list="brand-options"
              value={formData.brandName}
              onChange={e => setFormData({...formData, brandName: e.target.value})}
              className="w-full form-control"
            />
            <datalist id="brand-options">
              {brands.map(brand => (
                <option key={brand.id} value={brand.name} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="order-type" className="block text-xs font-medium text-gray-700 mb-1">合作类型</label>
            <Select
              id="order-type"
              value={formData.type}
              onChange={value => setFormData({...formData, type: value as OrderType})}
              className="w-full"
              options={[
                { value: 'paid', label: '付费' },
                { value: 'paid_product', label: '费用+产品' },
                { value: 'product_exchange', label: '置换' },
                { value: 'ecard', label: 'E卡' },
                { value: 'direct', label: '直发' },
              ]}
            />
          </div>
          {editingOrder && (
            <div>
              <label htmlFor="order-status" className="block text-xs font-medium text-gray-700 mb-1">状态</label>
              <Select
                id="order-status"
                value={formData.status}
                onChange={value => setFormData({...formData, status: value as OrderStatus})}
                className="w-full"
                options={[
                  { value: 'in_progress', label: '进行中' },
                  { value: 'completed', label: '已完成' },
                  { value: 'cancelled', label: '已取消' },
                ]}
              />
            </div>
          )}
          {formData.type !== 'product_exchange' && formData.type !== 'ecard' && (
          <div className={!editingOrder ? "sm:col-span-2" : "col-span-2 sm:col-span-1"}>
            <label htmlFor="order-amount" className="block text-xs font-medium text-gray-700 mb-1">金额 (¥)</label>
            <input id="order-amount" type="number" min="0" step="0.01" inputMode="decimal" value={formData.actualAmount} onChange={e => setFormData({...formData, actualAmount: e.target.value})} className="w-full form-control" />
          </div>
          )}
        </div>
        {hasOrderProducts(formData.type) && (
          <ProductFields prefix="order-product" products={formData.products} onChange={products => setFormData({ ...formData, products })} />
        )}
        {formData.type === 'ecard' && (
          <div>
            <label htmlFor="order-productValue2" className="block text-xs font-medium text-gray-700 mb-1">面值 (¥)</label>
            <input id="order-productValue2" type="number" min="0" value={formData.productValue} onChange={e => setFormData({...formData, productValue: e.target.value})} placeholder="E卡面值" className="w-full form-control" />
          </div>
        )}
        <div>
          <label htmlFor="order-platforms" className="block text-xs font-medium text-gray-700 mb-1">发布平台</label>
          <input id="order-platforms" type="text" placeholder="小红书, 抖音" value={formData.platforms} onChange={e => setFormData({...formData, platforms: e.target.value})} className="w-full form-control" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="order-acceptDate" className="block text-xs font-medium text-gray-700 mb-1">接单日期</label>
            <input id="order-acceptDate" type="date" value={formData.acceptDate} onChange={e => setFormData({...formData, acceptDate: e.target.value})} className="w-full form-control" />
          </div>
          <div>
            <label htmlFor="order-submitDate" className="block text-xs font-medium text-gray-700 mb-1">交稿日期</label>
            <input id="order-submitDate" type="date" value={formData.submitDate} onChange={e => setFormData({...formData, submitDate: e.target.value})} className="w-full form-control" />
          </div>
        </div>
        <div className="pt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm">取消</button>
          <button type="submit" disabled={isSubmitting} className="btn-sketch py-2 text-sm disabled:opacity-50">{isSubmitting ? '保存中...' : editingOrder ? '保存' : '创建'}</button>
        </div>
      </form>
    </Modal>
  );
}
