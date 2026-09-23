import type { AppSliceCreator } from '../types';
import type { Comment, PaidPromotion, PublishLink } from '../../types';
import { authFetch } from '../../lib/api';
import { getSessionEpoch, isSessionCurrent } from '../cache';

const createAuthFetch = () => authFetch;

// 详情请求竞态防护（#26）：快速切换商单时，旧请求晚返回会覆盖新结果。
// 每次发起请求递增代数，响应到达时若已不是最新一代则直接丢弃。
// 当前详情页正在查看的商单：写操作完成时若已切换商单，则丢弃写入结果
let currentDetailOrderId: string | null = null;

let commentsRequestSeq = 0;
let publishLinksRequestSeq = 0;
let paidPromotionsRequestSeq = 0;

// 登出时递增代数，使在途响应失效（防止上一账号数据写入新会话）
export const resetEngagementRequestSeqs = (): void => {
  commentsRequestSeq++;
  publishLinksRequestSeq++;
  paidPromotionsRequestSeq++;
  currentDetailOrderId = null;
};

export interface EngagementSlice {
  comments: Comment[];
  publishLinks: PublishLink[];
  paidPromotions: PaidPromotion[];
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
}

export const createEngagementSlice: AppSliceCreator<EngagementSlice> = (set, get) => ({
  comments: [],
  publishLinks: [],
  paidPromotions: [],

  fetchComments: async (orderId) => {
    currentDetailOrderId = orderId;
    const epoch = getSessionEpoch();
    const requestId = ++commentsRequestSeq;
    try {
      const res = await createAuthFetch()(`/api/comments/${orderId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取评论失败');
      }
      const data = await res.json();
      if (requestId !== commentsRequestSeq || !isSessionCurrent(epoch)) return;
      set({ comments: data });
    } catch (error) {
      if (requestId !== commentsRequestSeq) return;
      console.error('fetchComments失败:', error instanceof Error ? error.message : error);
      get().showToast('获取评论失败', 'error');
      throw error;
    }
  },
  addComment: async (orderId, content) => {
    const epoch = getSessionEpoch();
    try {
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
      if (!isSessionCurrent(epoch) || (currentDetailOrderId !== null && currentDetailOrderId !== orderId)) return;
      set((state) => ({ comments: [newComment, ...state.comments] }));
      get().showToast('评论添加成功', 'success');
    } catch (error) {
      console.error('addComment失败:', error instanceof Error ? error.message : error);
      get().showToast('添加评论失败', 'error');
      throw error;
    }
  },
  deleteComment: async (id) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/comments/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('删除评论失败');
      }
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({ comments: state.comments.filter(c => c.id !== id) }));
      get().showToast('评论已删除', 'success');
    } catch (error) {
      console.error('deleteComment失败:', error instanceof Error ? error.message : error);
      get().showToast('删除评论失败', 'error');
      throw error;
    }
  },

  fetchPublishLinks: async (orderId) => {
    currentDetailOrderId = orderId;
    const epoch = getSessionEpoch();
    const requestId = ++publishLinksRequestSeq;
    try {
      const res = await createAuthFetch()(`/api/publish-links/${orderId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取发布链接失败');
      }
      const data = await res.json();
      if (requestId !== publishLinksRequestSeq || !isSessionCurrent(epoch)) return;
      set({ publishLinks: data });
    } catch (error) {
      if (requestId !== publishLinksRequestSeq) return;
      console.error('fetchPublishLinks失败:', error instanceof Error ? error.message : error);
      get().showToast('获取发布链接失败', 'error');
      throw error;
    }
  },
  addPublishLink: async (orderId, platform, url) => {
    const epoch = getSessionEpoch();
    try {
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
      if (!isSessionCurrent(epoch) || (currentDetailOrderId !== null && currentDetailOrderId !== orderId)) return;
      set((state) => ({ publishLinks: [...state.publishLinks, newLink] }));
      get().showToast('发布链接添加成功', 'success');
    } catch (error) {
      console.error('addPublishLink失败:', error instanceof Error ? error.message : error);
      get().showToast('添加发布链接失败', 'error');
      throw error;
    }
  },
  batchAddPublishLinks: async (orderId, urls) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/publish-links/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, links: urls })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '批量添加发布链接失败');
      }
      const data = await res.json();
      if (!isSessionCurrent(epoch)) return { created: data.created };
      if (currentDetailOrderId !== null && currentDetailOrderId !== orderId) return { created: data.created };
      set((state) => ({ publishLinks: [...state.publishLinks, ...(data.links || [])] }));
      get().showToast(`已批量添加 ${data.created} 个发布链接`, 'success');
      return { created: data.created };
    } catch (error) {
      console.error('batchAddPublishLinks失败:', error instanceof Error ? error.message : error);
      get().showToast('批量添加发布链接失败', 'error');
      throw error;
    }
  },
  updatePublishLink: async (id, platform, url) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/publish-links/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, url })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新发布链接失败');
      }
      const updated = await res.json();
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({ publishLinks: state.publishLinks.map(l => l.id === id ? updated : l) }));
      get().showToast('发布链接更新成功', 'success');
    } catch (error) {
      console.error('updatePublishLink失败:', error instanceof Error ? error.message : error);
      get().showToast('更新发布链接失败', 'error');
      throw error;
    }
  },
  deletePublishLink: async (id) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/publish-links/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('删除发布链接失败');
      }
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({ publishLinks: state.publishLinks.filter(l => l.id !== id) }));
      get().showToast('发布链接已删除', 'success');
    } catch (error) {
      console.error('deletePublishLink失败:', error instanceof Error ? error.message : error);
      get().showToast('删除发布链接失败', 'error');
      throw error;
    }
  },
  fetchPaidPromotions: async (orderId) => {
    const requestId = ++paidPromotionsRequestSeq;
    const epoch = getSessionEpoch();
    try {
      const path = orderId ? `/api/paid-promotions?orderId=${encodeURIComponent(orderId)}` : '/api/paid-promotions';
      const res = await createAuthFetch()(path);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '获取付费推广记录失败');
      }
      const data = await res.json();
      if (requestId !== paidPromotionsRequestSeq || !isSessionCurrent(epoch)) return;
      set((state) => ({
        paidPromotions: orderId
          ? [...state.paidPromotions.filter(record => record.orderId !== orderId), ...data]
          // 全局刷新与详情合并共用集合：保留本地已知但服务端快照尚未包含的新增记录
          : [...data, ...state.paidPromotions.filter(record => !data.some((d: { id: string }) => d.id === record.id))]
      }));
    } catch (error) {
      if (requestId !== paidPromotionsRequestSeq) return;
      console.error('fetchPaidPromotions失败:', error instanceof Error ? error.message : error);
      get().showToast('获取付费推广记录失败', 'error');
      throw error;
    }
  },
  addPaidPromotion: async (orderId, platform, amount) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()('/api/paid-promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, platform, amount })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '添加付费推广记录失败');
      }
      const newRecord = await res.json();
      if (!isSessionCurrent(epoch) || (currentDetailOrderId !== null && currentDetailOrderId !== orderId)) return;
      set((state) => ({ paidPromotions: [newRecord, ...state.paidPromotions] }));
      get().showToast('付费推广记录已添加', 'success');
    } catch (error) {
      console.error('addPaidPromotion失败:', error instanceof Error ? error.message : error);
      get().showToast('添加付费推广记录失败', 'error');
      throw error;
    }
  },
  deletePaidPromotion: async (id) => {
    const epoch = getSessionEpoch();
    try {
      const res = await createAuthFetch()(`/api/paid-promotions/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('删除付费推广记录失败');
      }
      if (!isSessionCurrent(epoch)) return;
      set((state) => ({ paidPromotions: state.paidPromotions.filter(record => record.id !== id) }));
      get().showToast('付费推广记录已删除', 'success');
    } catch (error) {
      console.error('deletePaidPromotion失败:', error instanceof Error ? error.message : error);
      get().showToast('删除付费推广记录失败', 'error');
      throw error;
    }
  },
});
