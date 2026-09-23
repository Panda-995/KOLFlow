import type { StateCreator } from 'zustand';
import type { Order, OrderTemplate, OrderStatus, OrderType, Todo, Brand, Payment, Settings, ActivityLog, Comment, PublishLink, PaidPromotion, Asset } from '../types';

export type {
  Order, OrderTemplate, OrderStatus, OrderType, Todo, Brand, Payment,
  Settings, ActivityLog, Comment, PublishLink, PaidPromotion, Asset,
};

export interface AppState {
  isAuthenticated: boolean;
  orders: Order[];
  orderTemplates: OrderTemplate[];
  todos: Todo[];
  brands: Brand[];
  payments: Payment[];
  settings: Settings | null;
  dismissedNotifications: string[];
  activityLogs: ActivityLog[];
  comments: Comment[];
  publishLinks: PublishLink[];
  paidPromotions: PaidPromotion[];
  assets: Asset[];

  // 认证与安全
  setAuthenticated: (value: boolean) => void;
  login: (email: string, password: string, privacyAccepted: boolean) => Promise<{success: boolean, error?: string}>;
  register: (email: string, password: string, inviteCode: string, privacyAccepted: boolean) => Promise<{success: boolean, error?: string, isNew?: boolean}>;
  logout: () => void;
  updateSecurity: (email: string, password: string, oldPassword?: string) => Promise<{success: boolean, error?: string}>;
  generateApiKey: () => Promise<string>;

  // 商单与模板
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

  // 待办
  fetchTodos: () => Promise<void>;
  addTodo: (todo: Partial<Todo>) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;

  // 品牌
  fetchBrands: () => Promise<void>;
  addBrand: (brand: Partial<Brand>) => Promise<void>;
  updateBrand: (id: string, brand: Partial<Brand>) => Promise<void>;
  deleteBrand: (id: string) => Promise<void>;

  // 账单
  fetchPayments: () => Promise<void>;
  addPayment: (payment: Partial<Payment>) => Promise<void>;
  updatePayment: (id: string, payment: Partial<Payment>) => Promise<void>;
  settlePayment: (id: string, options?: { settled?: boolean }) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;

  // 设置与数据管理
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  clearData: () => Promise<void>;
  setAllData: (data: Record<string, unknown>) => Promise<void>;

  // 通知
  dismissNotification: (id: string) => void;
  clearNotifications: (ids: string[]) => void;

  // 操作日志
  activityLogsHasMore: boolean;
  activityLogsTotal: number;
  fetchActivityLogs: (options?: { limit?: number; offset?: number; append?: boolean }) => Promise<void>;
  fetchMoreActivityLogs: () => Promise<void>;
  clearActivityLogs: () => Promise<void>;

  // 评论 / 发布链接 / 付费推广（商单详情关联数据）
  fetchComments: (orderId: string) => Promise<void>;
  addComment: (orderId: string, content: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
  fetchPublishLinks: (orderId: string) => Promise<void>;
  addPublishLink: (orderId: string, platform: string, url: string) => Promise<void>;
  batchAddPublishLinks: (orderId: string, links: string[]) => Promise<{ created: number }>;
  updatePublishLink: (id: string, platform: string, url: string) => Promise<void>;
  deletePublishLink: (id: string) => Promise<void>;
  fetchPaidPromotions: (orderId?: string) => Promise<void>;
  addPaidPromotion: (orderId: string, platform: string, amount: number) => Promise<void>;
  deletePaidPromotion: (id: string) => Promise<void>;

  // 资产
  fetchAssets: () => Promise<void>;
  addAsset: (asset: Partial<Asset>) => Promise<void>;
  updateAsset: (id: string, asset: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;

  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// 各领域 slice 的创建器签名：返回 AppState 的一个子集，由 useStore 组合
export type AppSliceCreator<T extends object> = StateCreator<AppState, [], [], T>;
