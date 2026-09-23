import type { AppSliceCreator } from '../types';
import { apiFetch, authFetch, getConnectionHelpMessage } from '../../lib/api';
import { createEncryptedSensitiveBody } from '../../lib/authEncryption';
import { emitToast } from '../../components/Toast';
import { bumpSessionEpoch } from '../cache';
import { resetEngagementRequestSeqs } from './engagementSlice';

const createAuthFetch = () => authFetch;
const createFetch = () => apiFetch;

export interface AuthSlice {
  isAuthenticated: boolean;
  dismissedNotifications: string[];
  setAuthenticated: (value: boolean) => void;
  login: (email: string, password: string, privacyAccepted: boolean) => Promise<{success: boolean, error?: string}>;
  register: (email: string, password: string, inviteCode: string, privacyAccepted: boolean) => Promise<{success: boolean, error?: string, isNew?: boolean}>;
  logout: () => void;
  updateSecurity: (email: string, password: string, oldPassword?: string) => Promise<{success: boolean, error?: string}>;
  dismissNotification: (id: string) => void;
  clearNotifications: (ids: string[]) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const persistDismissedNotifications = (ids: string[]): void => {
  try {
    localStorage.setItem('dismissedNotifications', JSON.stringify(ids));
  } catch (error) {
    console.warn('保存通知状态失败:', error instanceof Error ? error.message : error);
  }
};

export const createAuthSlice: AppSliceCreator<AuthSlice> = (set, get) => ({
  isAuthenticated: localStorage.getItem('isAuthenticated') === 'true',
  dismissedNotifications: JSON.parse(localStorage.getItem('dismissedNotifications') || '[]'),

  setAuthenticated: (value: boolean) => {
    if (!value) {
      localStorage.removeItem('isAuthenticated');
    }
    set({ isAuthenticated: value });
  },

  dismissNotification: (id) => set((state) => {
    const newDismissed = Array.from(new Set([...state.dismissedNotifications, id]));
    persistDismissedNotifications(newDismissed);
    return { dismissedNotifications: newDismissed };
  }),

  clearNotifications: (ids) => set((state) => {
    const newDismissed = Array.from(new Set([...state.dismissedNotifications, ...ids]));
    persistDismissedNotifications(newDismissed);
    return { dismissedNotifications: newDismissed };
  }),

  showToast: (message, type) => {
    // 通过 ToastProvider 注册的全局出口发出可见通知（未挂载时降级为控制台日志）
    emitToast(message, type);
  },

  login: async (email, password, privacyAccepted) => {
    try {
      const body = await createEncryptedSensitiveBody(createFetch(), { email, password, privacyAccepted });
      const res = await createFetch()('/api/auth/login', {
        method: 'POST',
        body,
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('token', data.token);
        bumpSessionEpoch();
        set({ isAuthenticated: true });
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: getConnectionHelpMessage() };
    }
  },

  register: async (email, password, inviteCode, privacyAccepted) => {
    try {
      const body = await createEncryptedSensitiveBody(createFetch(), {
        email,
        password,
        inviteCode,
        privacyAccepted,
      });
      const res = await createFetch()('/api/auth/register', {
        method: 'POST',
        body,
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('isAuthenticated', 'true');
        localStorage.setItem('userId', data.userId);
        localStorage.setItem('token', data.token);
        // 新会话：递增代数，丢弃上一个账号在途的响应
        bumpSessionEpoch();
        set({ isAuthenticated: true });
        return { success: true, isNew: data.isNew };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: getConnectionHelpMessage() };
    }
  },

  logout: () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userId');
    localStorage.removeItem('token');
    localStorage.removeItem('dismissedNotifications');
    // 递增会话代数与详情请求代数，丢弃登出瞬间在途的旧响应
    bumpSessionEpoch();
    resetEngagementRequestSeqs();
    set({
      isAuthenticated: false,
      settings: null,
      orders: [],
      orderTemplates: [],
      todos: [],
      brands: [],
      payments: [],
      activityLogs: [],
      activityLogsHasMore: false,
      activityLogsTotal: 0,
      comments: [],
      publishLinks: [],
      paidPromotions: [],
      assets: [],
      dismissedNotifications: []
    });
  },

  updateSecurity: async (email, password, oldPassword) => {
    try {
      const body = await createEncryptedSensitiveBody(createFetch(), { email, password, oldPassword });
      const res = await createAuthFetch()('/api/settings/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await res.json();
      if (data.success) {
        // 修改密码会撤销所有旧 Token（服务端 tokenVersion 递增），
        // 本地必须同步退出登录，否则当前页面的后续请求全部 401
        if (typeof password === 'string' && password.length > 0) {
          get().logout();
        }
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: '网络错误' };
    }
  },
});
