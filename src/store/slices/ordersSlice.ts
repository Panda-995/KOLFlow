import type { AppSliceCreator } from '../types';
import type { Order, OrderStatus, OrderTemplate } from '../../types';
import { authFetch } from '../../lib/api';
import { formatLocalDate } from '../../lib/dateFilter';
import { getCached, setCache, invalidateCache } from '../cache';
import { getSessionEpoch, isSessionCurrent } from '../cache';

const createAuthFetch = () => authFetch;

export interface OrdersSlice {
  orders: Order[];
  orderTemplates: OrderTemplate[];
  fetchOrders: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  addOrder: (order: Partial<Order>) => Promise<void>;
  updateOrder: (id: string, order: Partial<Order>) => Promise<void>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  fetchOrderTemplates: () => Promise<void>;
  addOrderTemplate: (template: Partial<OrderTemplate>) => Promise<void>;
  updateOrderTemplate: (id: string, template: Partial<OrderTemplate>) => Promise<void>;
  deleteOrderTemplate: (id: string) => Promise<void>;
  createOrderFromTemplate: (id: string) => Promise<Order>;
}

export const createOrdersSlice: AppSliceCreator<OrdersSlice> = (set, get) => ({
  orders: [],
  orderTemplates: [],

  fetchOrders: async () => {
    const epoch = getSessionEpoch();
    try {
      const cached = getCached<Order[]>('orders');
      if (cached) {
        if (!isSessionCurrent(epoch)) return;
        set({ orders: cached });
        return;
      }
      const res = await createAuthFetch()('/api/orders');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取商单失败');
      }
      const data = await res.json();
      if (!isSessionCurrent(epoch)) return;
      setCache('orders', data);
      if (!isSessionCurrent(epoch)) return;
      set({ orders: data });
    } catch (error) {
      console.error('fetchOrders失败:', error instanceof Error ? error.message : error);
      get().showToast('获取商单失败，请稍后重试', 'error');
      throw error;
    }
  },
  // 绕过 store 的直连请求（如文件导入）修改数据后，用该方法强制刷新
  refreshOrders: async () => {
    // 内部各 fetch 各自做会话守卫
    invalidateCache('orders');
    invalidateCache('todos');
    invalidateCache('payments');
    await Promise.all([
      get().fetchOrders(),
      get().fetchTodos(),
      get().fetchPayments(),
      get().fetchAssets(),
    ]);
  },
  addOrder: async (order) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, operationDate: formatLocalDate() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建商单失败');
      }
      const newOrder = await res.json();
      invalidateCache('orders');
      const previousOrders = get().orders;
      if (!isSessionCurrent(epoch)) return;
      set({ orders: [newOrder, ...previousOrders] });
      get().showToast('商单创建成功', 'success');
      invalidateCache('todos');
      invalidateCache('payments');
      await Promise.all([
        get().fetchTodos(),
        get().fetchPayments(),
        get().fetchAssets(),
      ]);
    } catch (error) {
      console.error('addOrder失败:', error instanceof Error ? error.message : error);
      get().showToast('创建商单失败，请稍后重试', 'error');
      throw error;
    }
  },
  updateOrder: async (id, order) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...order, operationDate: formatLocalDate() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新商单失败');
      }
      const updatedOrder = await res.json();

      invalidateCache('orders');
      invalidateCache('todos');
      invalidateCache('payments');
      // 先落地本地状态：即使下游刷新失败，服务端已更新的事实也反映在界面上
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({ orders: state.orders.map(o => o.id === id ? updatedOrder : o) }));
      await Promise.all([
        get().fetchTodos(),
        get().fetchPayments(),
        get().fetchAssets(),
      ]);
      get().showToast('商单更新成功', 'success');
    } catch (error) {
      console.error('updateOrder失败:', error instanceof Error ? error.message : error);
      get().showToast('更新商单失败，请稍后重试', 'error');
      throw error;
    }
  },
  updateOrderStatus: async (id, status) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, operationDate: formatLocalDate() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新商单状态失败');
      }
      const updatedOrder = await res.json();

      invalidateCache('orders');
      invalidateCache('todos');
      invalidateCache('payments');
      // 先落地本地状态：即使下游刷新失败，服务端已更新的事实也反映在界面上
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({ orders: state.orders.map(o => o.id === id ? updatedOrder : o) }));
      await Promise.all([
        get().fetchTodos(),
        get().fetchPayments(),
        get().fetchAssets(),
      ]);
      get().showToast('商单状态更新成功', 'success');
    } catch (error) {
      console.error('updateOrderStatus失败:', error instanceof Error ? error.message : error);
      get().showToast('更新商单状态失败，请稍后重试', 'error');
      throw error;
    }
  },
  deleteOrder: async (id) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/orders/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除商单失败');
      }
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('orders');
      invalidateCache('todos');
      invalidateCache('payments');
      set((state) => ({ orders: state.orders.filter(o => o.id !== id) }));
      await Promise.all([
        get().fetchTodos(),
        get().fetchPayments(),
        get().fetchAssets(),
      ]);
      get().showToast('商单删除成功', 'success');
    } catch (error) {
      console.error('deleteOrder失败:', error instanceof Error ? error.message : error);
      get().showToast('删除商单失败，请稍后重试', 'error');
      throw error;
    }
  },

  fetchOrderTemplates: async () => {
    const epoch = getSessionEpoch();
    try {
      const cached = getCached<OrderTemplate[]>('orderTemplates');
      if (cached) {
        if (!isSessionCurrent(epoch)) return;
        set({ orderTemplates: cached });
        return;
      }
      const res = await createAuthFetch()('/api/order-templates');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取商单模板失败');
      }
      const data = await res.json();
      if (!isSessionCurrent(epoch)) return;
      setCache('orderTemplates', data);
      if (!isSessionCurrent(epoch)) return;
      set({ orderTemplates: data });
    } catch (error) {
      console.error('fetchOrderTemplates失败:', error instanceof Error ? error.message : error);
      get().showToast('获取商单模板失败，请稍后重试', 'error');
      throw error;
    }
  },

  addOrderTemplate: async (template) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/order-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建商单模板失败');
      }
      const newTemplate = await res.json();
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('orderTemplates');
      set((state) => ({ orderTemplates: [newTemplate, ...state.orderTemplates] }));
    } catch (error) {
      console.error('addOrderTemplate失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  },

  updateOrderTemplate: async (id, template) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/order-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新商单模板失败');
      }
      const updatedTemplate = await res.json();
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('orderTemplates');
      set((state) => ({
        orderTemplates: state.orderTemplates.map(templateItem => (
          templateItem.id === id ? updatedTemplate : templateItem
        )),
      }));
    } catch (error) {
      console.error('updateOrderTemplate失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  },

  deleteOrderTemplate: async (id) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/order-templates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除商单模板失败');
      }
      if (!isSessionCurrent(epoch)) return;
      invalidateCache('orderTemplates');
      set((state) => ({ orderTemplates: state.orderTemplates.filter(template => template.id !== id) }));
    } catch (error) {
      console.error('deleteOrderTemplate失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  },

  createOrderFromTemplate: async (id) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/order-templates/${id}/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationDate: formatLocalDate() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '从模板创建商单失败');
      }
      const newOrder = await res.json() as Order;
      // 会话已切换：不回写任何状态（避免把旧账号数据写入新账号），但仍返回结果以保持签名
      if (!isSessionCurrent(epoch)) return newOrder;
      invalidateCache('orders');
      invalidateCache('todos');
      set((state) => ({ orders: [newOrder, ...state.orders] }));
      await get().fetchTodos();
      return newOrder;
    } catch (error) {
      console.error('createOrderFromTemplate失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  },
});
