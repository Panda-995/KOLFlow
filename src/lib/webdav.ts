import { authFetch } from './api';
import { extractExportWarnings } from './backupNotice';

export const WEBDAV_CONFIG_KEY = 'webdavConfig';
export const WEBDAV_PASSWORD_KEY = 'webdavPassword';
export const WEBDAV_CONFIG_UPDATED_EVENT = 'kolflow:webdav-config-updated';
export const WEBDAV_LAST_SYNC_KEY = 'lastWebdavSync';
export const WEBDAV_LAST_SYNC_UPDATED_EVENT = 'kolflow:webdav-last-sync-updated';
export const WEBDAV_REMOTE_STATE_KEY = 'webdavRemoteExportedAt';
export const WEBDAV_LAST_ERROR_KEY = 'webdavLastError';

const HISTORY_DIR = 'kolflow_backups/';

// 与 store 的会话代数解耦：WebDAV 侧只需要"账号标识 + 代数"是否变化。
// 由 store 在会话切换时调用 bumpWebdavSession()。
let webdavSessionEpoch = 0;

export const bumpWebdavSession = (): void => {
  webdavSessionEpoch += 1;
};

const captureWebdavSession = () => {
  const epoch = webdavSessionEpoch;
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;
  return {
    isCurrent: () => (
      epoch === webdavSessionEpoch
      && (typeof window !== 'undefined' ? localStorage.getItem('userId') : null) === userId
    ),
  };
};
const HISTORY_KEEP_COUNT = 10;

// 云端备份被其他设备更新时抛出，UI 层据此引导用户先恢复或确认强制覆盖
export class WebdavConflictError extends Error {}
// 无法确认云端状态（服务器异常/网络错误）时抛出：此时上传可能覆盖未知数据
export class WebdavUnavailableError extends Error {}
// 同步任务所属账号已切换：任务作废，UI 层静默忽略（不当作失败记录/提示）
export class WebdavSessionCancelledError extends Error {}

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
  window.dispatchEvent(new Event(WEBDAV_LAST_SYNC_UPDATED_EVENT));
};

// 记录本设备已知云端备份的 exportedAt，用于上传前的冲突检测
export interface WebdavSyncError {
  reason: string;
  at: string;
  /** 自动或手动 */
  source: 'auto' | 'manual';
}

export const loadWebdavLastError = (): WebdavSyncError | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = readScopedStorage(localStorage, WEBDAV_LAST_ERROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WebdavSyncError;
    return parsed && typeof parsed.reason === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

// 记录失败状态；返回是否为"新的"失败（用于避免周期性自动同步反复打扰用户）
export const saveWebdavLastError = (reason: string, source: 'auto' | 'manual'): boolean => {
  const previous = loadWebdavLastError();
  const isNew = !previous || previous.reason !== reason;
  localStorage.setItem(
    getWebdavStorageKey(WEBDAV_LAST_ERROR_KEY),
    JSON.stringify({ reason, at: new Date().toISOString(), source } satisfies WebdavSyncError),
  );
  return isNew;
};

export const clearWebdavLastError = (): void => {
  localStorage.removeItem(getWebdavStorageKey(WEBDAV_LAST_ERROR_KEY));
};

export const loadWebdavRemoteState = (): string | null => (
  typeof window === 'undefined' ? null : readScopedStorage(localStorage, WEBDAV_REMOTE_STATE_KEY)
);

export const saveWebdavRemoteState = (value: string | null): void => {
  const key = getWebdavStorageKey(WEBDAV_REMOTE_STATE_KEY);
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
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

// 密码/用户名可能包含中文或 emoji：btoa 只接受 Latin-1，直接调用会抛
// InvalidCharacterError（同步根本发不出去）。这里先按 UTF-8 取字节再编码。
export const toBase64Utf8 = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const getWebdavAuthorization = (config: WebdavConfig): string => (
  `Basic ${toBase64Utf8(`${config.username}:${config.password}`)}`
);

type RemoteBackupState =
  | {
    status: 'ok';
    exportedAt: string | null;
    text: string;
    /** 服务器返回的版本标记：用于条件写入，避免跨设备并发覆盖 */
    etag: string | null;
    lastModified: string | null;
  }
  | { status: 'missing' }
  | { status: 'auth' }
  | { status: 'unknown' };

// WebDAV 请求统一 60 秒超时。注意：超时必须覆盖"读取响应体"的全过程——
// 只在 fetch 落地（收到响应头）后清除计时器的话，服务器先返回响应头再卡住时
// 仍会无限挂起（按钮长期显示"同步中"）。因此这里把 body 读取也纳入超时范围。
const WEBDAV_TIMEOUT_MS = 60_000;

const withWebdavTimeout = async <T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

export const webdavFetch = (url: string, init: RequestInit = {}): Promise<Response> => (
  withWebdavTimeout(signal => fetch(url, { ...init, signal }))
);

// 读取响应体（同样受超时保护）
export const webdavReadText = (url: string, init: RequestInit = {}): Promise<{ response: Response; text: string }> => (
  withWebdavTimeout(async signal => {
    const response = await fetch(url, { ...init, signal });
    const text = await response.text();
    return { response, text };
  })
);

// 读取云端当前备份：missing=不存在；unknown=服务器异常或网络错误（此时不能盲目覆盖）。
// ok 时同时返回原始文本，作为覆盖前历史副本的数据源。
const fetchRemoteState = async (config: WebdavConfig): Promise<RemoteBackupState> => {
  let response: Response;
  let text: string;
  try {
    // 响应体读取也在超时保护内（webdavReadText）
    const result = await webdavReadText(getWebdavFileUrl(config), {
      method: 'GET',
      headers: { Authorization: getWebdavAuthorization(config) },
    });
    response = result.response;
    text = result.text;
  } catch {
    return { status: 'unknown' };
  }
  if (response.status === 404) return { status: 'missing' };
  if (response.status === 401 || response.status === 403) return { status: 'auth' };
  if (!response.ok) return { status: 'unknown' };
  try {
    const parsed = JSON.parse(text); // 只解析一次，避免大备份的双重解析开销
    const exportedAt = typeof parsed?.exportedAt === 'string' ? parsed.exportedAt : null;
    return {
      status: 'ok',
      exportedAt,
      text,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    };
  } catch {
    // 内容不是合法 JSON：视为未知状态，避免覆盖无法解析的远端数据
    return { status: 'unknown' };
  }
};

// 把"将要被覆盖的云端旧版本"写入历史目录。某些服务器要求先 MKCOL 创建集合目录。
const putHistoryCopy = async (config: WebdavConfig, oldText: string): Promise<{ ok: boolean; status: number }> => {
  const baseUrl = config.url.endsWith('/') ? config.url : `${config.url}/`;
  const authorization = getWebdavAuthorization(config);
  // 时间戳 + 随机后缀：并发上传不会生成同名历史副本
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
  const historyUrl = `${baseUrl}${HISTORY_DIR}kolflow_backup_${stamp}.json`;
  const headers = { Authorization: authorization, 'Content-Type': 'application/json' };

  let response = await webdavFetch(historyUrl, { method: 'PUT', headers, body: oldText });
  if (!response.ok) {
    // 目录不存在时（409/404）尝试创建后重试一次
    await webdavFetch(`${baseUrl}${HISTORY_DIR}`, { method: 'MKCOL', headers: { Authorization: authorization } }).catch(() => {});
    response = await webdavFetch(historyUrl, { method: 'PUT', headers, body: oldText });
  }
  return { ok: response.ok || response.status === 201 || response.status === 204, status: response.status };
};

// 上传成功后尽力清理历史版本目录，只保留最近 N 份（失败不影响主流程）
const pruneHistoryCopies = async (config: WebdavConfig): Promise<void> => {
  try {
    const baseUrl = config.url.endsWith('/') ? config.url : `${config.url}/`;
    const authorization = getWebdavAuthorization(config);
    const { response, text: xml } = await webdavReadText(`${baseUrl}${HISTORY_DIR}`, {
      method: 'PROPFIND',
      headers: { Authorization: authorization, Depth: '1' },
    });
    if (!response.ok) return;
    const hrefs = Array.from(xml.matchAll(/<(?:[\w]+:)?href>([^<]+)<\/(?:[\w]+:)?href>/g)).map(m => m[1]);
    const names = hrefs
      .map(href => decodeURIComponent(href.split('/').pop() || ''))
      .filter(name => /^kolflow_backup_.+\.json$/.test(name))
      .sort();
    const excess = names.slice(0, Math.max(0, names.length - HISTORY_KEEP_COUNT));
    for (const name of excess) {
      await webdavFetch(`${baseUrl}${HISTORY_DIR}${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { Authorization: authorization },
      });
    }
  } catch {
    // 历史清理是尽力而为的增强能力
  }
};

// 模块级上传互斥锁：自动同步与手动同步共用，
// 并发时按到达顺序串行执行，各自在写入前重新探测云端状态。
let uploadChain: Promise<unknown> = Promise.resolve();

export interface WebdavUploadResult {
  syncedAt: string;
  /** 历史副本保存失败时的警告信息（主备份已成功上传） */
  historyWarning: string | null;
  /** 导出侧的可恢复性预警（如集合条数/体积超过导入上限） */
  exportWarnings: string[];
}

export const uploadWebdavBackup = (
  config: WebdavConfig,
  options: { force?: boolean } = {},
): Promise<WebdavUploadResult> => {
  // 会话必须在"入队时"绑定：排队期间切换账号后，任务一旦开始执行才捕获账号，
  // 就会用新账号的 Token 导出数据、再上传到旧账号配置的云端目录（跨账号泄露）。
  const session = captureWebdavSession();
  const assertSameSession = () => {
    if (!session.isCurrent()) {
      throw new WebdavSessionCancelledError('账号已切换，已取消本次 WebDAV 同步');
    }
  };

  // 与自动同步共享互斥锁：并发时串行执行，各自的探测都在获得锁之后进行
  const run = async (): Promise<WebdavUploadResult> => {
    // 执行前先校验：排队期间账号已切换的任务直接作废，不发任何请求
    assertSameSession();

    // 先探测云端状态：冲突检测与"覆盖前保存旧版本"都依赖这次读取
    const remote = await fetchRemoteState(config);
    assertSameSession();

    if (!options.force) {
      if (remote.status === 'auth') {
        throw new WebdavUnavailableError(
          'WebDAV 认证失败（用户名或密码错误），请检查配置后重试。'
        );
      }
      if (remote.status === 'unknown') {
        // 读取失败时无法确认云端状态，盲目 PUT 可能覆盖他人数据
        throw new WebdavUnavailableError(
          '无法确认云端备份状态（服务器异常或网络错误），已停止上传以避免覆盖。请检查服务器地址与账号密码后重试。'
        );
      }
      if (remote.status === 'ok') {
        const knownRemoteState = loadWebdavRemoteState();
        if (remote.exportedAt !== knownRemoteState) {
          throw new WebdavConflictError(
            '云端备份已被其他设备更新，直接上传会覆盖它。请先"恢复数据"合并云端进度，或确认强制覆盖。'
          );
        }
      }
    }

    // 覆盖已有云端数据前，先把旧版本存入历史目录（这是被覆盖数据的唯一找回途径）。
    // 强制覆盖时历史副本保存失败则中止写入；普通上传降级为警告。
    let historyWarning: string | null = null;
    if (remote.status === 'ok') {
      const saved = await putHistoryCopy(config, remote.text);
      if (saved.ok) {
        void pruneHistoryCopies(config);
      } else if (options.force) {
        throw new Error(`云端历史副本保存失败（HTTP ${saved.status}），已取消覆盖以保护旧数据。请检查 WebDAV 目录权限后重试。`);
      } else {
        historyWarning = `备份已上传，但覆盖前的历史副本保存失败（HTTP ${saved.status}）`;
      }
    }

    assertSameSession();
    const exportResponse = await authFetch('/api/data/export');
    if (!exportResponse.ok) throw new Error('获取导出数据失败');
    const data = await exportResponse.json();
    // 导出完成后再校验一次：避免"导出期间切换账号"导致跨账号上传
    assertSameSession();

    const authorization = getWebdavAuthorization(config);
    // 条件写入：把刚才读到的版本标记带上，若期间被其他设备改过，服务器返回 412 而不是覆盖。
    // 这样"设备 A 读到旧版本 → 设备 B 写入新版本 → A 覆盖"的并发窗口被关闭。
    const conditionalHeaders: Record<string, string> = {};
    if (remote.status === 'ok') {
      if (remote.etag) {
        conditionalHeaders['If-Match'] = remote.etag;
      } else if (remote.lastModified) {
        conditionalHeaders['If-Unmodified-Since'] = remote.lastModified;
      } else if (!options.force) {
        // 服务器既无 ETag 也无 Last-Modified：无法做条件写入，
        // 只能靠"刚读到的内容"判断，仍存在被并发覆盖的窗口。
        // 这种情况不再默认覆盖，需要用户显式强制（并在提示中说明保护是有条件的）。
        throw new WebdavConflictError(
          '该 WebDAV 服务器未提供版本信息（ETag/Last-Modified），无法保证并发写入保护。' +
          '为避免静默覆盖云端备份，已停止上传；如确认云端没有更新，可选择强制覆盖。',
        );
      }
    } else {
      // 云端原本没有备份：只在期间没有被其他设备创建时才允许写入
      conditionalHeaders['If-None-Match'] = '*';
    }

    const response = await webdavFetch(getWebdavFileUrl(config), {
      method: 'PUT',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        ...conditionalHeaders,
      },
      body: JSON.stringify(data, null, 2),
    });
    if (response.status === 412 || response.status === 409) {
      throw new WebdavConflictError(
        '云端备份在本次上传过程中被其他设备更新，已取消写入以免覆盖。请重新同步或恢复云端数据后再试。'
      );
    }
    if (!response.ok && response.status !== 201 && response.status !== 204) {
      throw new Error(`上传失败: ${response.status}`);
    }

    // 完成时再校验：写入的"上次同步时间/云端基准"是按账号分键存储的，
    // 期间切换账号会把这些写入新账号的作用域，污染新账号的同步基线。
    assertSameSession();
    if (typeof data?.exportedAt === 'string') {
      saveWebdavRemoteState(data.exportedAt);
    }
    const syncedAt = new Date().toISOString();
    saveWebdavLastSync(syncedAt);
    return { syncedAt, historyWarning, exportWarnings: extractExportWarnings(data) };
  };

  const result = uploadChain.then(run, run);
  uploadChain = result.catch(() => {}); // 失败不阻断后续调用
  return result;
};
