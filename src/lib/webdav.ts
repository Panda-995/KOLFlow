import { authFetch } from './api';
import { getInsecureHttpTransportError } from './transportSecurity';

export const WEBDAV_CONFIG_KEY = 'webdavConfig';
export const WEBDAV_PASSWORD_KEY = 'webdavPassword';
export const WEBDAV_CONFIG_UPDATED_EVENT = 'kolflow:webdav-config-updated';
export const WEBDAV_LAST_SYNC_KEY = 'lastWebdavSync';
export const INSECURE_WEBDAV_TRANSPORT_MESSAGE =
  'WebDAV 地址必须使用 HTTPS，以免认证用户名、密码和业务备份被明文传输。';

export type WebdavConfig = {
  url: string;
  username: string;
  password: string;
  syncInterval: string;
};

const EMPTY_CONFIG: WebdavConfig = { url: '', username: '', password: '', syncInterval: '0' };

export const getWebdavStorageKey = (baseKey: string, userId?: string | null): string => {
  const ownerId = userId || (typeof window !== 'undefined' ? localStorage.getItem('userId') : null) || 'anonymous';
  return `${baseKey}:${encodeURIComponent(ownerId)}`;
};

const readScopedStorage = (storage: Storage, baseKey: string): string | null => {
  const scopedKey = getWebdavStorageKey(baseKey);
  const scopedValue = storage.getItem(scopedKey);
  if (scopedValue !== null) return scopedValue;

  const legacyValue = storage.getItem(baseKey);
  if (legacyValue !== null) {
    storage.setItem(scopedKey, legacyValue);
    storage.removeItem(baseKey);
  }
  return legacyValue;
};

export const loadWebdavConfig = (): WebdavConfig => {
  if (typeof window === 'undefined') return { ...EMPTY_CONFIG };
  try {
    const raw = readScopedStorage(localStorage, WEBDAV_CONFIG_KEY);
    const saved = raw ? JSON.parse(raw) as Partial<WebdavConfig> : {};
    const legacyPassword = typeof saved.password === 'string' ? saved.password : '';
    const sessionPassword = readScopedStorage(sessionStorage, WEBDAV_PASSWORD_KEY) || legacyPassword;
    if (legacyPassword) {
      sessionStorage.setItem(getWebdavStorageKey(WEBDAV_PASSWORD_KEY), legacyPassword);
      localStorage.setItem(getWebdavStorageKey(WEBDAV_CONFIG_KEY), JSON.stringify({ ...saved, password: '' }));
    }
    return {
      url: typeof saved.url === 'string' ? saved.url : '',
      username: typeof saved.username === 'string' ? saved.username : '',
      password: sessionPassword,
      syncInterval: typeof saved.syncInterval === 'string' ? saved.syncInterval : '0',
    };
  } catch {
    return { ...EMPTY_CONFIG };
  }
};

export const saveWebdavConfig = (config: WebdavConfig): void => {
  const { password, ...safeConfig } = config;
  localStorage.setItem(getWebdavStorageKey(WEBDAV_CONFIG_KEY), JSON.stringify({ ...safeConfig, password: '' }));
  const passwordKey = getWebdavStorageKey(WEBDAV_PASSWORD_KEY);
  if (password) sessionStorage.setItem(passwordKey, password);
  else sessionStorage.removeItem(passwordKey);
  window.dispatchEvent(new Event(WEBDAV_CONFIG_UPDATED_EVENT));
};

export const loadWebdavLastSync = (): string | null => (
  typeof window === 'undefined' ? null : readScopedStorage(localStorage, WEBDAV_LAST_SYNC_KEY)
);

export const saveWebdavLastSync = (value: string): void => {
  localStorage.setItem(getWebdavStorageKey(WEBDAV_LAST_SYNC_KEY), value);
};

export const isWebdavUploadDue = (
  lastSyncTime: string | null,
  intervalHours: number,
  now: Date = new Date(),
): boolean => {
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) return false;
  if (!lastSyncTime) return true;
  const lastSyncMs = new Date(lastSyncTime).getTime();
  return Number.isNaN(lastSyncMs) || now.getTime() - lastSyncMs >= intervalHours * 60 * 60 * 1000;
};

export const getWebdavFileUrl = (config: WebdavConfig): string => {
  const baseUrl = config.url.endsWith('/') ? config.url : `${config.url}/`;
  return `${baseUrl}kolflow_backup.json`;
};

export const getWebdavAuthorization = (config: WebdavConfig): string => (
  `Basic ${btoa(`${config.username}:${config.password}`)}`
);

export const getWebdavTransportError = (
  config: WebdavConfig,
  pageUrl = typeof window !== 'undefined' ? window.location.href : '',
): string | null => (
  getInsecureHttpTransportError(getWebdavFileUrl(config), pageUrl)
    ? INSECURE_WEBDAV_TRANSPORT_MESSAGE
    : null
);

export const webdavFetch = (config: WebdavConfig, options: RequestInit): Promise<Response> => {
  const transportError = getWebdavTransportError(config);
  if (transportError) throw new Error(transportError);

  const headers = new Headers(options.headers);
  headers.set('Authorization', getWebdavAuthorization(config));
  return fetch(getWebdavFileUrl(config), { ...options, headers });
};

export const uploadWebdavBackup = async (config: WebdavConfig): Promise<string> => {
  const exportResponse = await authFetch('/api/data/export');
  if (!exportResponse.ok) throw new Error('获取导出数据失败');
  const data = await exportResponse.json();

  const response = await webdavFetch(config, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data, null, 2),
  });
  if (!response.ok && response.status !== 201 && response.status !== 204) {
    throw new Error(`上传失败: ${response.status}`);
  }

  const syncedAt = new Date().toISOString();
  saveWebdavLastSync(syncedAt);
  return syncedAt;
};
