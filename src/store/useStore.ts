import { create } from 'zustand';
import type { Order, OrderStatus, OrderType, Todo, Brand, Payment, Settings, ActivityLog, Comment, PublishLink } from '../types';

export type { Order, OrderStatus, OrderType, Todo, Brand, Payment, Settings, ActivityLog, Comment, PublishLink };

const getToken = (): string | null => {
  return localStorage.getItem('token');
};

const getBaseUrl = (): string => {
  return '';
};

const createAuthFetch = () => {
  const token = getToken();
  const baseUrl = getBaseUrl();
  return (url: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      ...options.headers as Record<string, string>,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const fullUrl = baseUrl ? `${baseUrl}${url}` : url;
    return fetch(fullUrl, {
      ...options,
      headers,
    });
  };
};

const createFetch = () => {
  const baseUrl = getBaseUrl();
  return (url: string, options: RequestInit = {}) => {
    const fullUrl = baseUrl ? `${baseUrl}${url}` : url;
    return fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers as Record<string, string>,
      },
    });
  };
};

// Simple cache with TTL (60 seconds for better performance)
const CACHE_TTL = 60 * 1000; // 60 seconds
const cache: Record<string, { data: any; timestamp: number }> = {};

const getCached = <T>(key: string): T | null => {
  const cached = cache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
};

const setCache = <T>(key: string, data: T): void => {
  cache[key] = { data, timestamp: Date.now() };
};

const invalidateCache = (key: string): void => {
  delete cache[key];
};

// 清空所有缓存
const invalidateAllCache = (): void => {
  Object.keys(cache).forEach(key => delete cache[key]);
};

interface AppState {
  isAuthenticated: boolean;
  orders: Order[];
  todos: Todo[];
  brands: Brand[];
  payments: Payment[];
  settings: Settings | null;
  dismissedNotifications: string[];
  activityLogs: ActivityLog[];
  comments: Comment[];
  publishLinks: PublishLink[];
  darkMode: boolean;

  setAuthenticated: (value: boolean) => void;
  login: (email: string, password: string) => Promise<{success: boolean, error?: string}>;
  register: (email: string, password: string, inviteCode: string) => Promise<{success: boolean, error?: string, isNew?: boolean}>;
  logout: () => void;
  updateSecurity: (email: string, password: string, oldPassword?: string) => Promise<{success: boolean, error?: string}>;
  generateApiKey: () => Promise<string | undefined>;

  fetchOrders: () => Promise<void>;
  addOrder: (order: Partial<Order>) => Promise<void>;
  updateOrder: (id: string, order: Partial<Order>) => Promise<void>;
  updateOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;

  fetchTodos: () => Promise<void>;
  addTodo: (todo: Partial<Todo>) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;

  fetchBrands: () => Promise<void>;
  addBrand: (brand: Partial<Brand>) => Promise<void>;
  updateBrand: (id: string, brand: Partial<Brand>) => Promise<void>;
  deleteBrand: (id: string) => Promise<void>;

  fetchPayments: () => Promise<void>;
  addPayment: (payment: Partial<Payment>) => Promise<void>;
  settlePayment: (id: string) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;

  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  updateDisplaySettings: (darkMode: boolean, reportFrequency: string) => Promise<void>;
  clearData: () => Promise<void>;
  setAllData: (data: any) => Promise<void>;
  dismissNotification: (id: string) => void;

  fetchActivityLogs: () => Promise<void>;
  clearActivityLogs: () => Promise<void>;

  fetchComments: (orderId: string) => Promise<void>;
  addComment: (orderId: string, content: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;

  fetchPublishLinks: (orderId: string) => Promise<void>;
  addPublishLink: (orderId: string, platform: string, url: string) => Promise<void>;
  batchAddPublishLinks: (orderId: string, links: string[]) => Promise<{ created: number }>;
  updatePublishLink: (id: string, platform: string, url: string) => Promise<void>;
  deletePublishLink: (id: string) => Promise<void>;

  toggleDarkMode: () => void;
  setDarkMode: (value: boolean) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const useStore = create<AppState>((set, get) => ({
  isAuthenticated: localStorage.getItem('isAuthenticated') === 'true',
  orders: [],
  setAuthenticated: (value: boolean) => {
    if (!value) {
      localStorage.removeItem('isAuthenticated');
    }
    set({ isAuthenticated: value });
  },
  todos: [],
  brands: [],
  payments: [],
  settings: null,
  dismissedNotifications: JSON.parse(localStorage.getItem('dismissedNotifications') || '[]'),
  activityLogs: [],
  comments: [],
  publishLinks: [],
  darkMode: localStorage.getItem('darkMode') === 'true',

  dismissNotification: (id) => set((state) => {
    const newDismissed = [...state.dismissedNotifications, id];
    localStorage.setItem('dismissedNotifications', JSON.stringify(newDismissed));
    return { dismissedNotifications: newDismissed };
  }),

  toggleDarkMode: () => set((state) => {
    const newValue = !state.darkMode;
    localStorage.setItem('darkMode', String(newValue));
    document.documentElement.classList.toggle('dark', newValue);
    return { darkMode: newValue };
  }),

  setDarkMode: (value) => {
    localStorage.setItem('darkMode', String(value));
    document.documentElement.classList.toggle('dark', value);
    set({ darkMode: value });
  },

  showToast: (message, type) => {
    console.log(`[${type.toUpperCase()}] ${message}`);
  },

  login: async (email, password) => {
    try {
      const res = await createFetch()('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('token', data.token);
        set({ isAuthenticated: true });
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: '网络错误' };
    }
  },

  register: async (email, password, inviteCode) => {
    try {
      const res = await createFetch()('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, inviteCode })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('token', data.token);
        set({ isAuthenticated: true });
        return { success: true, isNew: data.isNew };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: '网络错误' };
    }
  },

  logout: () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userId');
    localStorage.removeItem('token');
    invalidateAllCache();
    set({ isAuthenticated: false, settings: null, orders: [], todos: [], brands: [], payments: [] });
  },

  updateSecurity: async (email, password, oldPassword) => {
    try {
      const res = await createAuthFetch()('/api/settings/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, oldPassword })
      });
      const data = await res.json();
      if (data.success) {
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: '网络错误' };
    }
  },

  generateApiKey: async () => {
    try {
      const res = await createAuthFetch()('/api/settings/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '生成 API Key 失败');
      }
      const data = await res.json();
      if (data.apiKey) {
        set((state) => ({
          settings: state.settings ? { ...state.settings, apiKey: data.apiKey } : null
        }));
        return data.apiKey;
      }
      return undefined;
    } catch (e) {
      return undefined;
    }
  },

  fetchOrders: async () => {
    try {
      const cached = getCached<Order[]>('orders');
      if (cached) {
        set({ orders: cached });
        return;
      }
      const res = await createAuthFetch()('/api/orders');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取商单失败');
      }
      const data = await res.json();
      setCache('orders', data);
      set({ orders: data });
    } catch (error) {
      console.error('fetchOrders失败:', error instanceof Error ? error.message : error);
      get().showToast('获取商单失败，请稍后重试', 'error');
      throw error;
    }
  },
  addOrder: async (order) => {
    try {
      const res = await createAuthFetch()('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建商单失败');
      }
      const newOrder = await res.json();
      invalidateCache('orders');
      const previousOrders = get().orders;
      set({ orders: [newOrder, ...previousOrders] });
      set((state) => {
        const { fetchTodos } = state;
        return state;
      });
      get().showToast('商单创建成功', 'success');
      await get().fetchTodos();
    } catch (error) {
      console.error('addOrder失败:', error instanceof Error ? error.message : error);
      get().showToast('创建商单失败，请稍后重试', 'error');
      throw error;
    }
  },
  updateOrder: async (id, order) => {
    try {
      const res = await createAuthFetch()(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新商单失败');
      }
      const updatedOrder = await res.json();

      invalidateCache('orders');
      if (updatedOrder.status === 'completed') {
        invalidateCache('todos');
        invalidateCache('payments');
        await get().fetchTodos();
        await get().fetchPayments();
      }

      set((state) => ({ orders: state.orders.map(o => o.id === id ? updatedOrder : o) }));
      get().showToast('商单更新成功', 'success');
    } catch (error) {
      console.error('updateOrder失败:', error instanceof Error ? error.message : error);
      get().showToast('更新商单失败，请稍后重试', 'error');
      throw error;
    }
  },
  updateOrderStatus: async (id, status) => {
    try {
      const res = await createAuthFetch()(`/api/orders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新商单状态失败');
      }
      const updatedOrder = await res.json();

      invalidateCache('orders');
      if (updatedOrder.status === 'completed') {
        invalidateCache('todos');
        invalidateCache('payments');
        await get().fetchTodos();
        await get().fetchPayments();
      }

      set((state) => ({ orders: state.orders.map(o => o.id === id ? updatedOrder : o) }));
      get().showToast('商单状态更新成功', 'success');
    } catch (error) {
      console.error('updateOrderStatus失败:', error instanceof Error ? error.message : error);
      get().showToast('更新商单状态失败，请稍后重试', 'error');
      throw error;
    }
  },
  deleteOrder: async (id) => {
    try {
      const res = await createAuthFetch()(`/api/orders/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除商单失败');
      }
      invalidateCache('orders');
      invalidateCache('todos');
      invalidateCache('payments');
      set((state) => {
        const filtered = state.orders.filter(o => o.id !== id);
        get().fetchTodos();
        get().fetchPayments();
        return { orders: filtered };
      });
      get().showToast('商单删除成功', 'success');
    } catch (error) {
      console.error('deleteOrder失败:', error instanceof Error ? error.message : error);
      get().showToast('删除商单失败，请稍后重试', 'error');
      throw error;
    }
  },

  fetchTodos: async () => {
    try {
      const cached = getCached<Todo[]>('todos');
      if (cached) {
        set({ todos: cached });
        return;
      }
      const res = await createAuthFetch()('/api/todos');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取待办失败');
      }
      const data = await res.json();
      setCache('todos', data);
      set({ todos: data });
    } catch (error) {
      console.error('fetchTodos失败:');
      throw error;
    }
  },
  addTodo: async (todo) => {
    try {
      const res = await createAuthFetch()('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(todo)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建待办失败');
      }
      const newTodo = await res.json();
      invalidateCache('todos');
      set((state) => ({ todos: [newTodo, ...state.todos] }));
      get().showToast('待办创建成功', 'success');
    } catch (error) {
      console.error('addTodo失败:', error instanceof Error ? error.message : error);
      get().showToast('创建待办失败，请稍后重试', 'error');
      throw error;
    }
  },
  toggleTodo: async (id) => {
    try {
      const res = await createAuthFetch()(`/api/todos/${id}/toggle`, { method: 'PUT' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '切换待办状态失败');
      }
      const updatedTodo = await res.json();
      invalidateCache('todos');
      set((state) => ({ todos: state.todos.map(t => t.id === id ? updatedTodo : t) }));
    } catch (error) {
      console.error('toggleTodo失败:', error instanceof Error ? error.message : error);
      get().showToast('切换待办状态失败，请稍后重试', 'error');
      throw error;
    }
  },
  deleteTodo: async (id) => {
    try {
      const res = await createAuthFetch()(`/api/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除待办失败');
      }
      invalidateCache('todos');
      set((state) => ({ todos: state.todos.filter(t => t.id !== id) }));
      get().showToast('待办删除成功', 'success');
    } catch (error) {
      console.error('deleteTodo失败:', error instanceof Error ? error.message : error);
      get().showToast('删除待办失败，请稍后重试', 'error');
      throw error;
    }
  },

  fetchBrands: async () => {
    try {
      const cached = getCached<Brand[]>('brands');
      if (cached) {
        set({ brands: cached });
        return;
      }
      const res = await createAuthFetch()('/api/brands');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取品牌失败');
      }
      const data = await res.json();
      setCache('brands', data);
      set({ brands: data });
    } catch (error) {
      console.error('fetchBrands失败:');
      throw error;
    }
  },
  addBrand: async (brand) => {
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
      invalidateCache('brands');
      set((state) => ({ brands: [newBrand, ...state.brands] }));
      get().showToast('品牌创建成功', 'success');
    } catch (error) {
      console.error('addBrand失败:', error instanceof Error ? error.message : error);
      get().showToast('创建品牌失败，请稍后重试', 'error');
    }
  },
  updateBrand: async (id, brand) => {
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
      invalidateCache('brands');
      set((state) => ({ brands: state.brands.map(b => b.id === id ? updatedBrand : b) }));
      get().showToast('品牌更新成功', 'success');
    } catch (error) {
      console.error('updateBrand失败:', error instanceof Error ? error.message : error);
      get().showToast('更新品牌失败，请稍后重试', 'error');
      throw error;
    }
  },
  deleteBrand: async (id) => {
    try {
      const res = await createAuthFetch()(`/api/brands/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除品牌失败');
      }
      invalidateCache('brands');
      set((state) => ({ brands: state.brands.filter(b => b.id !== id) }));
      get().showToast('品牌删除成功', 'success');
    } catch (error) {
      console.error('deleteBrand失败:', error instanceof Error ? error.message : error);
      get().showToast('删除品牌失败，请稍后重试', 'error');
      throw error;
    }
  },

  fetchPayments: async () => {
    try {
      const cached = getCached<Payment[]>('payments');
      if (cached) {
        set({ payments: cached });
        return;
      }
      const res = await createAuthFetch()('/api/payments');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取账单失败');
      }
      const data = await res.json();
      setCache('payments', data);
      set({ payments: data });
    } catch (error) {
      console.error('fetchPayments失败:');
      throw error;
    }
  },
  addPayment: async (payment) => {
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
      invalidateCache('payments');
      set((state) => ({ payments: [newPayment, ...state.payments] }));
      get().showToast('账单创建成功', 'success');
    } catch (error) {
      console.error('addPayment失败:', error instanceof Error ? error.message : error);
      get().showToast('创建账单失败，请稍后重试', 'error');
      throw error;
    }
  },
  settlePayment: async (id) => {
    try {
      const res = await createAuthFetch()(`/api/payments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'settled' })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '结算账单失败');
      }
      const updated = await res.json();
      invalidateCache('payments');
      set((state) => ({ payments: state.payments.map(p => p.id === id ? updated : p) }));
      get().showToast('账单结算成功', 'success');
    } catch (error) {
      console.error('settlePayment失败:', error instanceof Error ? error.message : error);
      get().showToast('结算账单失败，请稍后重试', 'error');
      throw error; 
    }
  },
  deletePayment: async (id) => {
    try {
      const res = await createAuthFetch()(`/api/payments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '删除账单失败');
      }
      invalidateCache('payments');
      set((state) => ({ payments: state.payments.filter(p => p.id !== id) }));
      get().showToast('账单删除成功', 'success');
    } catch (error) {
      console.error('deletePayment失败:', error instanceof Error ? error.message : error);
      get().showToast('删除账单失败，请稍后重试', 'error');
      throw error;
    }
  },

  fetchSettings: async () => {
    try {
      const res = await createAuthFetch()('/api/settings');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取设置失败');
      }
      const data = await res.json();
      set({ settings: data });
    } catch (error) {
      console.error('fetchSettings失败:', error instanceof Error ? error.message : error);
      set({ settings: null });
      throw error;
    }
  },
  updateSettings: async (settings) => {
    try {
      const res = await createAuthFetch()('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新设置失败');
      }
      const updatedSettings = await res.json();
      set({ settings: updatedSettings });
      get().showToast('设置更新成功', 'success');
    } catch (error) {
      console.error('updateSettings失败:', error instanceof Error ? error.message : error);
      get().showToast('更新设置失败，请稍后重试', 'error');
      throw error;
    }
  },
  updateDisplaySettings: async (darkMode, reportFrequency) => {
    try {
      const res = await createAuthFetch()('/api/settings/display', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ darkMode, reportFrequency })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新显示设置失败');
      }
      const updatedSettings = await res.json();
      set((state) => ({ settings: state.settings ? { ...state.settings, ...updatedSettings } : null }));
      get().showToast('显示设置更新成功', 'success');
    } catch (error) {
      console.error('updateDisplaySettings失败:', error instanceof Error ? error.message : error);
      get().showToast('更新显示设置失败，请稍后重试', 'error');
      throw error;
    }
  },
  clearData: async () => {
    try {
      const res = await createAuthFetch()('/data/clear', { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('清空数据失败');
      }
      localStorage.clear();
      invalidateAllCache();
      set({ orders: [], todos: [], brands: [], payments: [], activityLogs: [], comments: [], publishLinks: [], settings: null });
      get().showToast('数据已清空', 'success');
    } catch (error) {
      console.error('clearData失败:', error instanceof Error ? error.message : error);
      get().showToast('清空数据失败', 'error');
      throw error;
    }
  },
  setAllData: async (data) => {
    try {
      const token = localStorage.getItem('token');
      const res = await createFetch()('/api/data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '导入数据失败');
      }
      const imported = await res.json();
      if (token) {
        localStorage.setItem('token', token);
      }
      if (imported.orders) set({ orders: imported.orders });
      if (imported.todos) set({ todos: imported.todos });
      if (imported.brands) set({ brands: imported.brands });
      if (imported.payments) set({ payments: imported.payments });
      if (imported.settings) set({ settings: imported.settings });
      invalidateAllCache();
      get().showToast('数据导入成功', 'success');
    } catch (error) {
      console.error('setAllData失败:', error instanceof Error ? error.message : error);
      get().showToast('数据导入失败', 'error');
      throw error;
    }
  },

  fetchActivityLogs: async () => {
    try {
      const res = await createAuthFetch()('/api/logs');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取日志失败');
      }
      const data = await res.json();
      set({ activityLogs: data });
    } catch (error) {
      console.error('fetchActivityLogs失败:', error instanceof Error ? error.message : error);
      get().showToast('获取日志失败', 'error');
      throw error;
    }
  },
  clearActivityLogs: async () => {
    try {
      const res = await createAuthFetch()('/api/logs', { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('清空日志失败');
      }
      set({ activityLogs: [] });
      get().showToast('日志已清空', 'success');
    } catch (error) {
      console.error('clearActivityLogs失败:', error instanceof Error ? error.message : error);
      get().showToast('清空日志失败', 'error');
    }
  },

  fetchComments: async (orderId) => {
    try {
      const res = await createAuthFetch()(`/comments/${orderId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取评论失败');
      }
      const data = await res.json();
      set({ comments: data });
    } catch (error) {
      console.error('fetchComments失败:', error instanceof Error ? error.message : error);
      get().showToast('获取评论失败', 'error');
      throw error;
    }
  },
  addComment: async (orderId, content) => {
    try {
      const res = await createAuthFetch()('/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, content })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '添加评论失败');
      }
      const newComment = await res.json();
      set((state) => ({ comments: [newComment, ...state.comments] }));
      get().showToast('评论添加成功', 'success');
    } catch (error) {
      console.error('addComment失败:', error instanceof Error ? error.message : error);
      get().showToast('添加评论失败', 'error');
      throw error;
    }
  },
  deleteComment: async (id) => {
    try {
      const res = await createAuthFetch()(`/comments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('删除评论失败');
      }
      set((state) => ({ comments: state.comments.filter(c => c.id !== id) }));
      get().showToast('评论已删除', 'success');
    } catch (error) {
      console.error('deleteComment失败:', error instanceof Error ? error.message : error);
      get().showToast('删除评论失败', 'error');
    }
  },

  fetchPublishLinks: async (orderId) => {
    try {
      const res = await createAuthFetch()(`/publish-links/${orderId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取发布链接失败');
      }
      const data = await res.json();
      set({ publishLinks: data });
    } catch (error) {
      console.error('fetchPublishLinks失败:', error instanceof Error ? error.message : error);
      get().showToast('获取发布链接失败', 'error');
      throw error;
    }
  },
  addPublishLink: async (orderId, platform, url) => {
    try {
      const res = await createAuthFetch()('/publish-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, platform, url })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '添加发布链接失败');
      }
      const newLink = await res.json();
      set((state) => ({ publishLinks: [...state.publishLinks, newLink] }));
      get().showToast('发布链接添加成功', 'success');
    } catch (error) {
      console.error('addPublishLink失败:', error instanceof Error ? error.message : error);
      get().showToast('添加发布链接失败', 'error');
      throw error;
    }
  },
  batchAddPublishLinks: async (orderId, links) => {
    let created = 0;
    for (const link of links) {
      try {
        await get().addPublishLink(orderId, link.platform, link.url);
        created++;
      } catch (e) {
        console.error('批量添加发布链接失败:', e);
      }
    }
    return { created };
  },
  updatePublishLink: async (id, platform, url) => {
    try {
      const res = await createAuthFetch()(`/publish-links/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, url })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新发布链接失败');
      }
      const updated = await res.json();
      set((state) => ({ publishLinks: state.publishLinks.map(l => l.id === id ? updated : l) }));
      get().showToast('发布链接更新成功', 'success');
    } catch (error) {
      console.error('updatePublishLink失败:', error instanceof Error ? error.message : error);
      get().showToast('更新发布链接失败', 'error');
      throw error;
    }
  },
  deletePublishLink: async (id) => {
    try {
      const res = await createAuthFetch()(`/publish-links/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('删除发布链接失败');
      }
      set((state) => ({ publishLinks: state.publishLinks.filter(l => l.id !== id) }));
      get().showToast('发布链接已删除', 'success');
    } catch (error) {
      console.error('deletePublishLink失败:', error instanceof Error ? error.message : error);
      get().showToast('删除发布链接失败', 'error');
      throw error;
    }
  },
}));