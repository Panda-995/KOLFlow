// 模块级请求缓存：带 TTL，任何绕过 store 的写操作后必须主动失效对应集合
export const CACHE_TTL = 60 * 1000; // 60 seconds

const cache: Record<string, { data: unknown; timestamp: number }> = {};

import { abortSessionRequests } from '../lib/api';
import { bumpWebdavSession } from '../lib/webdav';

export const getCached = <T>(key: string): T | null => {
  const cached = cache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  return null;
};

export const setCache = <T>(key: string, data: T): void => {
  cache[key] = { data, timestamp: Date.now() };
};

export const invalidateCache = (key: string): void => {
  delete cache[key];
};

export const invalidateAllCache = (): void => {
  Object.keys(cache).forEach(key => delete cache[key]);
};

// 会话代数：登录/注册/登出/清空数据时递增。
// 每个数据请求在发起时记录代数，返回后若代数已变化则丢弃结果，
// 避免"账号 A 的响应写进账号 B 的 store 与缓存"。
let sessionEpoch = 0;

export const getSessionEpoch = (): number => sessionEpoch;

export const isSessionCurrent = (epoch: number): boolean => epoch === sessionEpoch;

export const bumpSessionEpoch = (): void => {
  sessionEpoch += 1;
  invalidateAllCache();
  // 中止所有在途请求：响应体读取阶段发生的账号切换也不会写入旧账号数据
  abortSessionRequests();
  // WebDAV 后台任务同样绑定会话，切换账号后不再继续上传
  bumpWebdavSession();
};
