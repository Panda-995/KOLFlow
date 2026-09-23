import type { AppSliceCreator } from '../types';
import type { Brand, Payment } from '../../types';
import { authFetch } from '../../lib/api';
import { formatLocalDate } from '../../lib/dateFilter';
import { getCached, setCache, invalidateCache } from '../cache';
import { getSessionEpoch, isSessionCurrent } from '../cache';

const createAuthFetch = () => authFetch;

export interface BrandsSlice {
  brands: Brand[];
  fetchBrands: () => Promise<void>;
  addBrand: (brand: Partial<Brand>) => Promise<void>;
  updateBrand: (id: string, brand: Partial<Brand>) => Promise<void>;
  deleteBrand: (id: string) => Promise<void>;
}

export const createBrandsSlice: AppSliceCreator<BrandsSlice> = (set, get) => ({
  brands: [],

  fetchBrands: async () => {
    const epoch = getSessionEpoch();
    try {
      const cached = getCached<Brand[]>('brands');
      if (cached) {
        if (!isSessionCurrent(epoch)) return;
        set({ brands: cached });
        return;
      }
      const res = await createAuthFetch()('/api/brands');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取品牌失败');
      }
      const data = await res.json();
      if (!isSessionCurrent(epoch)) return;
      setCache('brands', data);
      if (!isSessionCurrent(epoch)) return;
      set({ brands: data });
    } catch (error) {
      console.error('fetchBrands失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  },
  addBrand: async (brand) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brand)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建品牌失败');
      }
      const newBrand = await res.json();
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('brands');
      set((state) => ({ brands: [newBrand, ...state.brands] }));
      get().showToast('品牌创建成功', 'success');
    } catch (error) {
      console.error('addBrand失败:', error instanceof Error ? error.message : error);
      get().showToast('创建品牌失败，请稍后重试', 'error');
      throw error;
    }
  },
  updateBrand: async (id, brand) => {
    const epoch = getSessionEpoch();
    const previousName = get().brands.find(item => item.id === id)?.name;
    try {
      const res = await createAuthFetch()(`/api/brands/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brand)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新品牌失败');
      }
      const updatedBrand = await res.json();
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('brands');
      if (previousName && previousName !== updatedBrand.name) {
        for (const key of ['orders', 'todos', 'payments', 'assets', 'orderTemplates']) invalidateCache(key);
      }
      set((state) => ({
        brands: state.brands.map(b => b.id === id ? updatedBrand : b),
        ...(previousName && previousName !== updatedBrand.name ? {
          orders: state.orders.map(o => o.brandName === previousName ? { ...o, brandName: updatedBrand.name } : o),
          todos: state.todos.map(t => t.brandId === id || t.category === previousName ? { ...t, brandId: id, category: updatedBrand.name } : t),
          payments: state.payments.map(p => p.brand === previousName ? { ...p, brand: updatedBrand.name } : p),
          assets: state.assets.map(a => a.brandName === previousName ? { ...a, brandName: updatedBrand.name } : a),
          orderTemplates: state.orderTemplates.map(t => t.brandName === previousName ? { ...t, brandName: updatedBrand.name } : t),
        } : {}),
      }));
      get().showToast('品牌更新成功', 'success');
    } catch (error) {
      console.error('updateBrand失败:', error instanceof Error ? error.message : error);
      get().showToast('更新品牌失败，请稍后重试', 'error');
      throw error;
    }
  },
  deleteBrand: async (id) => {
    const epoch = getSessionEpoch();
    const previousName = get().brands.find(item => item.id === id)?.name;
    try {
      const res = await createAuthFetch()(`/api/brands/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除品牌失败');
      }
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('brands');
      for (const key of ['orders', 'todos', 'payments', 'assets', 'orderTemplates']) invalidateCache(key);
      set((state) => ({
        brands: state.brands.filter(b => b.id !== id),
        orders: state.orders.map(o => previousName && o.brandName === previousName ? { ...o, brandName: '' } : o),
        todos: state.todos.map(t => t.brandId === id || (previousName && t.category === previousName) ? { ...t, brandId: undefined, category: '' } : t),
        payments: state.payments.map(p => previousName && p.brand === previousName ? { ...p, brand: '' } : p),
        assets: state.assets.map(a => previousName && a.brandName === previousName ? { ...a, brandName: '' } : a),
        orderTemplates: state.orderTemplates.map(t => previousName && t.brandName === previousName ? { ...t, brandName: '' } : t),
      }));
      get().showToast('品牌删除成功', 'success');
    } catch (error) {
      console.error('deleteBrand失败:', error instanceof Error ? error.message : error);
      get().showToast('删除品牌失败，请稍后重试', 'error');
      throw error;
    }
  },
});

export interface PaymentsSlice {
  payments: Payment[];
  fetchPayments: () => Promise<void>;
  addPayment: (payment: Partial<Payment>) => Promise<void>;
  updatePayment: (id: string, payment: Partial<Payment>) => Promise<void>;
  settlePayment: (id: string, options?: { settled?: boolean }) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
}

export const createPaymentsSlice: AppSliceCreator<PaymentsSlice> = (set, get) => ({
  payments: [],

  fetchPayments: async () => {
    const epoch = getSessionEpoch();
    try {
      const cached = getCached<Payment[]>('payments');
      if (cached) {
        if (!isSessionCurrent(epoch)) return;
        set({ payments: cached });
        return;
      }
      const res = await createAuthFetch()('/api/payments');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取账单失败');
      }
      const data = await res.json();
      if (!isSessionCurrent(epoch)) return;
      setCache('payments', data);
      if (!isSessionCurrent(epoch)) return;
      set({ payments: data });
    } catch (error) {
      console.error('fetchPayments失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  },
  addPayment: async (payment) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payment)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建账单失败');
      }
      const newPayment = await res.json();
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('payments');
      set((state) => ({ payments: [newPayment, ...state.payments] }));
      get().showToast('账单创建成功', 'success');
    } catch (error) {
      console.error('addPayment失败:', error instanceof Error ? error.message : error);
      get().showToast('创建账单失败，请稍后重试', 'error');
      throw error;
    }
  },
  updatePayment: async (id, payment) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/payments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payment)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新账单失败');
      }
      const updatedPayment = await res.json();
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('payments');
      set((state) => ({ payments: state.payments.map(p => p.id === id ? updatedPayment : p) }));
      get().showToast('账单更新成功', 'success');
    } catch (error) {
      console.error('updatePayment失败:', error instanceof Error ? error.message : error);
      get().showToast('更新账单失败，请稍后重试', 'error');
      throw error;
    }
  },
  settlePayment: async (id, options) => {
    const epoch = getSessionEpoch();
    try {
      // 显式传递目标状态（幂等），避免重复请求或重试时反向操作
      const body: Record<string, unknown> = { settledDate: formatLocalDate() };
      if (options?.settled !== undefined) body.settled = options.settled;
      const res = await createAuthFetch()(`/api/payments/${id}/settle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '结算账单失败');
      }
      const updated = await res.json();
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('payments');
      set((state) => ({ payments: state.payments.map(p => p.id === id ? updated : p) }));
      get().showToast(updated.type === 'settled' ? '账单结算成功' : '已撤销结算', 'success');
    } catch (error) {
      console.error('settlePayment失败:', error instanceof Error ? error.message : error);
      get().showToast('结算账单失败，请稍后重试', 'error');
      throw error;
    }
  },
  deletePayment: async (id) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/payments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除账单失败');
      }
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('payments');
      set((state) => ({ payments: state.payments.filter(p => p.id !== id) }));
      get().showToast('账单删除成功', 'success');
    } catch (error) {
      console.error('deletePayment失败:', error instanceof Error ? error.message : error);
      get().showToast('删除账单失败，请稍后重试', 'error');
      throw error;
    }
  },
});
