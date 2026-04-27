import { create } from 'zustand';
import type { Order, OrderStatus, OrderType, Todo, Brand, Payment, Settings, ActivityLog, Comment, PublishLink } from '../types';
import { getBaseUrl } from '../lib/mobileApi';

export type { Order, OrderStatus, OrderType, Todo, Brand, Payment, Settings, ActivityLog, Comment, PublishLink };

const getToken = (): string | null => {
  return localStorage.getItem('token');
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
  updatePayment: (id: string, payment: Partial<Payment>) => Promise<void>;
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
}

export const useStore = create<AppState>((set, get) => ({
  isAuthenticated: localStorage.getItem('isAuthenticated') === 'true',
  orders: [],
  todos: [],
  brands: [],
  payments: [],
  setAuthenticated: (value: boolean) => {
    if (!value) {
      localStorage.removeItem('isAuthenticated');
    }
    set({ isAuthenticated: value });
  },
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
    const cached = getCached<Order[]>('orders');
    if (cached) {
      set({ orders: cached });
      return;
    }
    const res = await createAuthFetch()('/api/orders');
    const data = await res.json();
    setCache('orders', data);
    set({ orders: data });
  },
  addOrder: async (order) => {
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
    invalidateCache('todos');
    set({ orders: [newOrder, ...get().orders] });
    await get().fetchTodos();
  },
  updateOrder: async (id, order) => {
    const res = await createAuthFetch()(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    const updatedOrder = await res.json();

    invalidateCache('orders');
    if (updatedOrder.status === 'completed') {
      invalidateCache('todos');
      invalidateCache('payments');
      await get().fetchTodos();
      await get().fetchPayments();
    }

    set({ orders: get().orders.map(o => o.id === id ? updatedOrder : o) });
  },
  updateOrderStatus: async (id, status) => {
    const res = await createAuthFetch()(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const updatedOrder = await res.json();

    invalidateCache('orders');
    if (updatedOrder.status === 'completed') {
      invalidateCache('todos');
      invalidateCache('payments');
      await get().fetchTodos();
      await get().fetchPayments();
    }

    set({ orders: get().orders.map(o => o.id === id ? updatedOrder : o) });
  },
  deleteOrder: async (id) => {
    await createAuthFetch()(`/api/orders/${id}`, { method: 'DELETE' });
    invalidateCache('orders');
    invalidateCache('todos');
    invalidateCache('payments');
    set({ orders: get().orders.filter(o => o.id !== id) });
    await get().fetchTodos();
    await get().fetchPayments();
  },

  fetchTodos: async () => {
    const cached = getCached<Todo[]>('todos');
    if (cached) {
      set({ todos: cached });
      return;
    }
    const res = await createAuthFetch()('/api/todos');
    const data = await res.json();
    setCache('todos', data);
    set({ todos: data });
  },
  addTodo: async (todo) => {
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
    set({ todos: [newTodo, ...get().todos] });
  },
  toggleTodo: async (id) => {
    const res = await createAuthFetch()(`/api/todos/${id}/toggle`, { method: 'PUT' });
    const updatedTodo = await res.json();
    invalidateCache('todos');
    set({ todos: get().todos.map(t => t.id === id ? updatedTodo : t) });
  },
  deleteTodo: async (id) => {
    await createAuthFetch()(`/api/todos/${id}`, { method: 'DELETE' });
    invalidateCache('todos');
    set({ todos: get().todos.filter(t => t.id !== id) });
  },

  fetchBrands: async () => {
    const cached = getCached<Brand[]>('brands');
    if (cached) {
      set({ brands: cached });
      return;
    }
    const res = await createAuthFetch()('/api/brands');
    const data = await res.json();
    setCache('brands', data);
    set({ brands: data });
  },
  addBrand: async (brand) => {
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
    set({ brands: [newBrand, ...get().brands] });
  },
  updateBrand: async (id, brand) => {
    const res = await createAuthFetch()(`/api/brands/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brand)
    });
    const updatedBrand = await res.json();
    invalidateCache('brands');
    set({ brands: get().brands.map(b => b.id === id ? updatedBrand : b) });
  },
  deleteBrand: async (id) => {
    await createAuthFetch()(`/api/brands/${id}`, { method: 'DELETE' });
    invalidateCache('brands');
    set({ brands: get().brands.filter(b => b.id !== id) });
  },

  fetchPayments: async () => {
    const cached = getCached<Payment[]>('payments');
    if (cached) {
      set({ payments: cached });
      return;
    }
    const res = await createAuthFetch()('/api/payments');
    const data = await res.json();
    setCache('payments', data);
    set({ payments: data });
  },
  addPayment: async (payment) => {
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
    set({ payments: [newPayment, ...get().payments] });
  },
  updatePayment: async (id, payment) => {
    const res = await createAuthFetch()(`/api/payments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payment)
    });
    const updatedPayment = await res.json();
    invalidateCache('payments');
    set({ payments: get().payments.map(p => p.id === id ? updatedPayment : p) });
  },
  settlePayment: async (id) => {
    const res = await createAuthFetch()(`/api/payments/${id}/settle`, { method: 'PUT' });
    const updatedPayment = await res.json();
    invalidateCache('payments');
    set({ payments: get().payments.map(p => p.id === id ? updatedPayment : p) });
  },
  deletePayment: async (id) => {
    await createAuthFetch()(`/api/payments/${id}`, { method: 'DELETE' });
    invalidateCache('payments');
    set({ payments: get().payments.filter(p => p.id !== id) });
  },

  fetchSettings: async () => {
    const cached = getCached<Settings>('settings');
    if (cached) {
      set({ settings: cached, darkMode: cached.darkMode || false });
      if (cached.darkMode) {
        document.documentElement.classList.add('dark');
      }
      return;
    }
    const res = await createAuthFetch()('/api/settings');
    const data = await res.json();
    setCache('settings', data);
    set({ settings: data, darkMode: data.darkMode || false });
    if (data.darkMode) {
      document.documentElement.classList.add('dark');
    }
  },
  updateSettings: async (settings) => {
    try {
      const res = await createAuthFetch()('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error('Failed to update settings');
      const updatedSettings = await res.json();
      invalidateCache('settings');
      set({ settings: updatedSettings });
    } catch (error) {
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
      const updatedSettings = await res.json();
      invalidateCache('settings');
      set({ settings: updatedSettings, darkMode });
      document.documentElement.classList.toggle('dark', darkMode);
    } catch (error) {
      throw error;
    }
  },
  clearData: async () => {
    const res = await createAuthFetch()('/api/data/clear', { method: 'POST' });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '清空数据失败');
    }
    set({ orders: [], todos: [], brands: [], payments: [] });
  },
  setAllData: async (data) => {
    const res = await createAuthFetch()('/api/data/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const responseData = await res.json();
      throw new Error(responseData.error || '导入数据失败');
    }
    await get().fetchOrders();
    await get().fetchTodos();
    await get().fetchBrands();
    await get().fetchPayments();
    await get().fetchSettings();
  },

  fetchActivityLogs: async () => {
    const res = await createAuthFetch()('/api/logs');
    const data = await res.json();
    set({ activityLogs: data });
  },
  clearActivityLogs: async () => {
    await createAuthFetch()('/api/logs', { method: 'DELETE' });
    set({ activityLogs: [] });
  },

  fetchComments: async (orderId) => {
    const res = await createAuthFetch()(`/api/comments/${orderId}`);
    const data = await res.json();
    set({ comments: data });
  },
  addComment: async (orderId, content) => {
    const res = await createAuthFetch()('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, content })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '添加评论失败');
    }
    const newComment = await res.json();
    set({ comments: [newComment, ...get().comments] });
  },
  deleteComment: async (id) => {
    await createAuthFetch()(`/api/comments/${id}`, { method: 'DELETE' });
    set({ comments: get().comments.filter(c => c.id !== id) });
  },

  fetchPublishLinks: async (orderId) => {
    const res = await createAuthFetch()(`/api/publish-links/${orderId}`);
    const data = await res.json();
    set({ publishLinks: data });
  },
  addPublishLink: async (orderId, platform, url) => {
    const res = await createAuthFetch()('/api/publish-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, platform, url })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '添加发布链接失败');
    }
    const newLink = await res.json();
    set({ publishLinks: [newLink, ...get().publishLinks] });
  },
  batchAddPublishLinks: async (orderId, links) => {
    const res = await createAuthFetch()('/api/publish-links/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, links })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || '批量添加发布链接失败');
    }
    const result = await res.json();
    await get().fetchPublishLinks(orderId);
    return { created: result.created };
  },
  updatePublishLink: async (id, platform, url) => {
    const res = await createAuthFetch()(`/api/publish-links/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, url })
    });
    const updatedLink = await res.json();
    set({ publishLinks: get().publishLinks.map(l => l.id === id ? updatedLink : l) });
  },
  deletePublishLink: async (id) => {
    await createAuthFetch()(`/api/publish-links/${id}`, { method: 'DELETE' });
    set({ publishLinks: get().publishLinks.filter(l => l.id !== id) });
  }
}));
