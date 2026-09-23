import type { AppSliceCreator } from '../types';
import type { Asset, Settings } from '../../types';
import { authFetch } from '../../lib/api';
import { formatLocalDate } from '../../lib/dateFilter';
import { getSessionEpoch, isSessionCurrent, bumpSessionEpoch } from '../cache';
import { resetEngagementRequestSeqs } from './engagementSlice';

const createAuthFetch = () => authFetch;

export interface SettingsSlice {
  settings: Settings | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  generateApiKey: () => Promise<string>;
  clearData: () => Promise<void>;
  setAllData: (data: Record<string, unknown>) => Promise<void>;
}

export const createSettingsSlice: AppSliceCreator<SettingsSlice> = (set, get) => ({
  settings: null,

  fetchSettings: async () => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/settings');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取设置失败');
      }
      const data = await res.json();
      if (!isSessionCurrent(epoch)) return;
      set({ settings: data });
    } catch (error) {
      console.error('fetchSettings失败:', error instanceof Error ? error.message : error);
      if (!isSessionCurrent(epoch)) return;
      set({ settings: null });
      throw error;
    }
  },
  updateSettings: async (settings) => {
    const epoch = getSessionEpoch();
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
      if (!isSessionCurrent(epoch)) return;
      set({ settings: updatedSettings });
    } catch (error) {
      console.error('updateSettings失败:', error instanceof Error ? error.message : error);
      get().showToast('更新设置失败，请稍后重试', 'error');
      throw error;
    }
  },
  generateApiKey: async () => {
    const epoch = getSessionEpoch();
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
      if (!data.apiKey) {
        throw new Error('API Key 生成失败');
      }
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({
        settings: state.settings ? { ...state.settings, apiKey: data.apiKey } : null
      }));
      return data.apiKey;
    } catch (e) {
      console.error('generateApiKey失败:', e instanceof Error ? e.message : e);
      throw e;
    }
  },
  clearData: async () => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/data/clear', { method: 'POST' });
      if (!res.ok) {
        throw new Error('清空数据失败');
      }
      // 期间账号已切换：放弃后续处理，避免把结果写进新账号
      if (!isSessionCurrent(epoch)) return;
      // 数据已清空等同于数据换代：递增代数作废其它在途响应（本动作是切换源，不再自我拦截）。
      // bumpSessionEpoch 内部会清空所有缓存。
      bumpSessionEpoch();
      resetEngagementRequestSeqs();
      set({ orders: [], orderTemplates: [], todos: [], brands: [], payments: [], assets: [], activityLogs: [], activityLogsHasMore: false, activityLogsTotal: 0, comments: [], publishLinks: [], paidPromotions: [] });
      get().showToast('数据已清空', 'success');
    } catch (error) {
      console.error('clearData失败:', error instanceof Error ? error.message : error);
      get().showToast('清空数据失败', 'error');
      throw error;
    }
  },
  setAllData: async (data) => {
    const epoch = getSessionEpoch();
    let imported = false;
    try {
      const res = await createAuthFetch()('/api/data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, operationDate: formatLocalDate() })
      });
      if (!res.ok) {
        const errorBody = await res.json();
        throw new Error(errorBody.error || '导入数据失败');
      }
      await res.json();
      imported = true;
      // 期间账号已切换：放弃后续处理（服务端已按当前账号写入，不回写本地状态）
      if (!isSessionCurrent(epoch)) return;
      // 恢复数据同样属于数据换代：递增代数作废恢复前的在途列表请求（#6），
      // 否则它们返回后会把恢复前的数据覆盖回页面。
      // 清空会话级的评论/链接缓存（与换代同为同步操作，顺序不影响结果）
      set({ comments: [], publishLinks: [] });
      bumpSessionEpoch();
      // 自身就是"数据换代"的源头：换代后必须重新捕获 epoch，
      // 否则下面基于旧 epoch 的校验会永远短路（刷新结果与提示都发不出来）。
      const refreshedEpoch = getSessionEpoch();
      resetEngagementRequestSeqs();
      // 数据此刻已经写入成功：刷新失败只能说明"本地列表没跟上"，
      // 不能再报"导入失败"（用户会以为数据没恢复，可能重复操作）。
      const refreshResults = await Promise.allSettled([
        get().fetchOrders(),
        get().fetchOrderTemplates(),
        get().fetchTodos(),
        get().fetchBrands(),
        get().fetchPayments(),
        get().fetchSettings(),
        get().fetchAssets(),
        get().fetchPaidPromotions(),
        get().fetchActivityLogs(),
      ]);
      if (!isSessionCurrent(refreshedEpoch)) return;
      const failedCount = refreshResults.filter(result => result.status === 'rejected').length;
      if (failedCount > 0) {
        console.error('setAllData: 导入成功但部分列表刷新失败', failedCount);
        get().showToast(`数据已导入成功，但有 ${failedCount} 类列表刷新失败，请刷新页面查看`, 'warning');
      } else {
        get().showToast('数据导入成功', 'success');
      }
    } catch (error) {
      console.error('setAllData失败:', error instanceof Error ? error.message : error);
      // 走到这里只可能是"导入请求本身失败"（刷新失败已在上面的 allSettled 中单独处理）
      if (imported) {
        get().showToast('数据已导入，但后续刷新出错，请刷新页面查看', 'warning');
        return;
      }
      get().showToast('数据导入失败', 'error');
      throw error;
    }
  },
});

export interface AssetsSlice {
  assets: Asset[];
  fetchAssets: () => Promise<void>;
  addAsset: (asset: Partial<Asset>) => Promise<void>;
  updateAsset: (id: string, asset: Partial<Asset>) => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;
}

export const createAssetsSlice: AppSliceCreator<AssetsSlice> = (set, get) => ({
  assets: [],

  fetchAssets: async () => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/assets');
      if (!res.ok) throw new Error('获取资产列表失败');
      const data = await res.json();
      if (!isSessionCurrent(epoch)) return;
      set({ assets: data });
    } catch (error) {
      console.error('fetchAssets失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  },
  addAsset: async (asset) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...asset, operationDate: formatLocalDate() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '创建资产失败');
      }
      const created = await res.json();
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({ assets: [created, ...state.assets] }));
      get().showToast('资产创建成功', 'success');
    } catch (error) {
      console.error('addAsset失败:', error instanceof Error ? error.message : error);
      get().showToast('创建资产失败，请稍后重试', 'error');
      throw error;
    }
  },
  updateAsset: async (id, asset) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/assets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...asset, operationDate: formatLocalDate() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新资产失败');
      }
      const updated = await res.json();
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({ assets: state.assets.map(a => a.id === id ? updated : a) }));
    } catch (error) {
      console.error('updateAsset失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  },
  deleteAsset: async (id) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/assets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除资产失败');
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({ assets: state.assets.filter(a => a.id !== id) }));
    } catch (error) {
      console.error('deleteAsset失败:', error instanceof Error ? error.message : error);
      throw error;
    }
  },
});
