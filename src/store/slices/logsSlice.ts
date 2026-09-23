import type { AppSliceCreator } from '../types';
import type { ActivityLog } from '../../types';
import { authFetch } from '../../lib/api';
import { getSessionEpoch, isSessionCurrent } from '../cache';

const createAuthFetch = () => authFetch;

// 日志分页：首页 100 条，"加载更多"按页追加（#27 数据增长扩展机制）
export const ACTIVITY_LOGS_PAGE_SIZE = 100;

export interface LogsSlice {
  activityLogs: ActivityLog[];
  activityLogsHasMore: boolean;
  activityLogsTotal: number;
  fetchActivityLogs: (options?: { limit?: number; offset?: number; append?: boolean }) => Promise<void>;
  fetchMoreActivityLogs: () => Promise<void>;
  clearActivityLogs: () => Promise<void>;
}

export const createLogsSlice: AppSliceCreator<LogsSlice> = (set, get) => ({
  activityLogs: [],
  activityLogsHasMore: false,
  activityLogsTotal: 0,

  fetchActivityLogs: async (options) => {
    const epoch = getSessionEpoch();
    try {
      const limit = options?.limit ?? ACTIVITY_LOGS_PAGE_SIZE;
      const offset = options?.offset ?? 0;
      const append = options?.append ?? false;
      const res = await createAuthFetch()(`/api/logs?limit=${limit}&offset=${offset}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取日志失败');
      }
      const data = await res.json();
      const total = Number(res.headers.get('X-Total-Count') || data.length);
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({
        activityLogs: append ? [...state.activityLogs, ...data] : data,
        activityLogsTotal: total,
        activityLogsHasMore: offset + data.length < total,
      }));
    } catch (error) {
      console.error('fetchActivityLogs失败:', error instanceof Error ? error.message : error);
      get().showToast('获取日志失败', 'error');
      throw error;
    }
  },
  fetchMoreActivityLogs: async () => {
    // 实际请求由 fetchActivityLogs 完成，会话守卫在那里统一处理
    const { activityLogs, activityLogsHasMore } = get();
    if (!activityLogsHasMore) return;
    await get().fetchActivityLogs({ offset: activityLogs.length, append: true });
  },
  clearActivityLogs: async () => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/logs', { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('清空日志失败');
      }
      if (!isSessionCurrent(epoch)) return;
      set({ activityLogs: [], activityLogsHasMore: false, activityLogsTotal: 0 });
      get().showToast('日志已清空', 'success');
    } catch (error) {
      console.error('clearActivityLogs失败:', error instanceof Error ? error.message : error);
      get().showToast('清空日志失败', 'error');
    }
  },
});
