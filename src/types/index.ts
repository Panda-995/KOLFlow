// 商单类型
export type OrderStatus = 'in_progress' | 'completed' | 'cancelled';
export type OrderType = 'paid' | 'product_exchange' | 'direct' | 'ecard';

// 商单接口
export interface Order {
  id: string;
  orderNo: string;
  title: string;
  type: OrderType;
  status: OrderStatus;
  actualAmount: number;
  brandName: string;
  platforms: string[];
  acceptDate: string;
  submitDate: string;
  productName?: string;
  productValue?: number;
}

// 待办接口
export interface Todo {
  id: string;
  content: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  completed: boolean;
  dueDate: string;
  orderId?: string;
  brandId?: string;
  orderStatus?: string;
  orderNo?: string;
}

// 品牌联系人接口
export interface BrandContact {
  id: string;
  name: string;
  phone: string;
  note: string;
}

// 品牌接口
export interface Brand {
  id: string;
  name: string;
  industry: string;
  contact: string;
  phone: string;
  contacts: BrandContact[];
  totalOrders: number;
  totalIncome: number;
}

// 账单接口
export interface Payment {
  id: string;
  orderNo: string;
  brand: string;
  amount: number;
  type: 'received' | 'pending' | 'settled' | 'refunded';
  date: string;
  method: string;
  createdAt?: string;
}

// 资产库接口
export interface Asset {
  id: string;
  orderId: string;
  orderNo: string;
  brandName: string;
  productName: string;
  productValue: number;
  image?: string;
  saleStatus: 'keep' | 'sold';
  soldAmount: number;
  soldDate?: string;
  createdAt: string;
}

// 设置接口
export interface Settings {
  id: string;
  displayName: string;
  email: string;
  bio: string;
  orderReminder: boolean;
  weeklyReport: boolean;
  avatar?: string;
  apiKey?: string;
  darkMode?: boolean;
  reportFrequency?: 'weekly' | 'monthly';
}

// 操作日志接口
export interface ActivityLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

// 评论接口
export interface Comment {
  id: string;
  orderId: string;
  content: string;
  createdAt: string;
}

// 发布链接接口
export interface PublishLink {
  id: string;
  orderId: string;
  platform: string;
  url: string;
  createdAt: string;
}

// 用户接口
export interface User {
  id: string;
  email: string;
  password: string;
  displayName: string;
  avatar?: string;
  createdAt: string;
}

// Express Request 扩展
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
