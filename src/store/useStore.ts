import { create } from 'zustand';
import type { AppState } from './types';
import { createAuthSlice } from './slices/authSlice';
import { createOrdersSlice } from './slices/ordersSlice';
import { createTodosSlice } from './slices/todosSlice';
import { createBrandsSlice, createPaymentsSlice } from './slices/brandsPaymentsSlice';
import { createLogsSlice } from './slices/logsSlice';
import { createEngagementSlice } from './slices/engagementSlice';
import { createSettingsSlice, createAssetsSlice } from './slices/settingsAssetsSlice';

export type {
  Order, OrderTemplate, OrderStatus, OrderType, Todo, Brand, Payment,
  Settings, ActivityLog, Comment, PublishLink, PaidPromotion, Asset,
} from './types';

// 组合根：useStore 的对外 API 与拆分前完全一致。
// 领域逻辑按 slice 拆分在 ./slices/ 下（认证、商单、待办、品牌、账单、日志、详情关联、设置、资产）。
export const useStore = create<AppState>()((...args) => ({
  ...createAuthSlice(...args),
  ...createOrdersSlice(...args),
  ...createTodosSlice(...args),
  ...createBrandsSlice(...args),
  ...createPaymentsSlice(...args),
  ...createLogsSlice(...args),
  ...createEngagementSlice(...args),
  ...createSettingsSlice(...args),
  ...createAssetsSlice(...args),
}));
