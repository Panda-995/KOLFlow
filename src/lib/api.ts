import { Capacitor, CapacitorHttp, type HttpOptions } from '@capacitor/core';

export const SERVER_BASE_URL_KEY = 'kolflow.serverBaseUrl';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const normalizeServerUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withProtocol);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('服务端地址仅支持 HTTP 或 HTTPS');
  }

  url.hash = '';
  url.search = '';
  url.pathname = '';
  return trimTrailingSlash(url.toString());
};

export const isNativeAppRuntime = (): boolean => {
  if (Capacitor.isNativePlatform()) return true;
  if (typeof window === 'undefined') return false;

  const runtime = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (runtime?.isNativePlatform?.()) return true;
  return ['capacitor:', 'file:', 'ionic:'].includes(window.location.protocol);
};

export const getServerBaseUrl = (): string => {
  if (typeof window === 'undefined') return '';
  if (!isNativeAppRuntime()) return '';
  return localStorage.getItem(SERVER_BASE_URL_KEY) || localStorage.getItem('serverBaseUrl') || '';
};

export const getSavedServerBaseUrl = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(SERVER_BASE_URL_KEY) || localStorage.getItem('serverBaseUrl') || '';
};

export const setServerBaseUrl = (value: string): string => {
  const normalized = normalizeServerUrl(value);
  if (normalized) {
    localStorage.setItem(SERVER_BASE_URL_KEY, normalized);
  } else {
    localStorage.removeItem(SERVER_BASE_URL_KEY);
    localStorage.removeItem('serverBaseUrl');
  }
  return normalized;
};

export const getNativeServerUrlError = (value: string): string | null => {
  if (!isNativeAppRuntime()) return null;

  const normalized = normalizeServerUrl(value);
  if (!normalized) {
    return '请先输入服务端地址';
  }

  const hostname = new URL(normalized).hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.startsWith('127.')
  ) {
    return 'App 内不能使用 localhost 或 127.0.0.1。Android 模拟器请用 http://10.0.2.2:3000，真机请用电脑局域网 IP，例如 http://192.168.x.x:3000。';
  }

  return null;
};

export const getConnectionHelpMessage = (value = getSavedServerBaseUrl()): string => {
  let target = value;
  try {
    target = normalizeServerUrl(value);
  } catch {
    target = value;
  }

  const suffix = target ? ` 当前地址：${target}` : '';
  if (isNativeAppRuntime()) {
    return `无法连接服务端。请确认服务端正在运行，Android 模拟器使用 http://10.0.2.2:3000，真机使用电脑局域网 IP，例如 http://192.168.x.x:3000，并确认手机和电脑在同一网络。${suffix}`;
  }

  return `无法连接服务端，请确认服务正在运行。${suffix}`;
};

export const getActiveServerUrl = (): string => {
  const configured = getServerBaseUrl();
  if (configured) return configured;
  if (typeof window === 'undefined' || isNativeAppRuntime()) return '';
  return window.location.origin;
};

export const buildApiUrl = (path: string): string => {
  if (/^https?:\/\//i.test(path)) return path;

  const baseUrl = getServerBaseUrl();
  if (!baseUrl) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
};

const isFormDataBody = (body: BodyInit | null | undefined): boolean => {
  return typeof FormData !== 'undefined' && body instanceof FormData;
};

const headersToObject = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const createResponseFromNative = (data: unknown, status: number, headers?: Record<string, string>): Response => {
  const body = typeof data === 'string' ? data : JSON.stringify(data ?? null);
  return new Response(body, {
    status,
    headers: {
      'Content-Type': typeof data === 'string' ? 'text/plain' : 'application/json',
      ...(headers || {}),
    },
  });
};

// 会话级请求登记：账号切换（登录/登出/清空）时统一中止在途请求。
// 登记一直保留到"响应体被读完"为止：只在 fetch 落地（收到响应头）时注销的话，
// 切号发生在 await res.json() 期间就再也找不到该请求，无法统一中止。
const sessionAbortControllers = new Set<AbortController>();

export const abortSessionRequests = (): void => {
  for (const controller of sessionAbortControllers) {
    try {
      controller.abort();
    } catch {
      // 忽略重复中止
    }
  }
  sessionAbortControllers.clear();
};

/** 是否为"会话切换导致的中止"（用于避免把中止当成业务错误提示用户） */
export const isSessionAbort = (error: unknown): boolean => (
  typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError'
);

const createSessionAbortError = (): Error => {
  const error = new Error('请求已随会话切换中止');
  error.name = 'AbortError';
  return error;
};

type ResponseBodyMethod = 'json' | 'text' | 'arrayBuffer' | 'blob' | 'formData';

// 包装响应对象，把"读取响应体"纳入会话保护：
// ① 读取期间保持登记 —— 此时 abort() 会真正中断 body 读取；
// ② 读取完成后再检查一次 —— 若期间已切换账号，抛 AbortError 而不是把旧账号数据交给调用方。
const trackResponseBody = (response: Response, controller: AbortController): Response => {
  const methods: ResponseBodyMethod[] = ['json', 'text', 'arrayBuffer', 'blob', 'formData'];
  for (const method of methods) {
    const original = response[method] as ((...args: never[]) => Promise<unknown>) | undefined;
    if (typeof original !== 'function') continue;
    Object.defineProperty(response, method, {
      configurable: true,
      writable: true,
      value: async (...args: never[]): Promise<unknown> => {
        try {
          const result = await original.apply(response, args);
          if (controller.signal.aborted) throw createSessionAbortError();
          return result;
        } finally {
          sessionAbortControllers.delete(controller);
        }
      },
    });
  }
  return response;
};

export const apiFetch = async (path: string, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers);
  // 登记本次请求，会话切换时中止；同时保留调用方自带的 signal 语义
  const sessionController = new AbortController();
  sessionAbortControllers.add(sessionController);
  const callerSignal = options.signal;
  if (callerSignal) {
    if (callerSignal.aborted) sessionController.abort();
    else callerSignal.addEventListener('abort', () => sessionController.abort(), { once: true });
  }
  if (options.body && !isFormDataBody(options.body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = buildApiUrl(path);
  const shouldUseNativeHttp = isNativeAppRuntime() && !isFormDataBody(options.body);

  if (shouldUseNativeHttp) {
    const method = (options.method || 'GET').toUpperCase();
    const nativeOptions: HttpOptions = {
      url,
      method,
      headers: headersToObject(headers),
    };

    if (options.body !== undefined && options.body !== null) {
      nativeOptions.data = typeof options.body === 'string' ? options.body : String(options.body);
    }

    try {
      const nativeResponse = await CapacitorHttp.request(nativeOptions);
      // CapacitorHttp 不支持 AbortSignal（无法中断在途原生请求），
      // 因此只能在拿到结果后校验：已切换账号则丢弃这次响应，不交给调用方。
      if (sessionController.signal.aborted) throw createSessionAbortError();
      return trackResponseBody(
        createResponseFromNative(nativeResponse.data, nativeResponse.status, nativeResponse.headers),
        sessionController,
      );
    } finally {
      sessionAbortControllers.delete(sessionController);
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      signal: sessionController.signal,
    });
  } catch (error) {
    sessionAbortControllers.delete(sessionController);
    throw error;
  }
  // 不在此处注销：登记随响应体读取结束（见 trackResponseBody）
  return trackResponseBody(response, sessionController);
};

export const authFetch = (path: string, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return apiFetch(path, {
    ...options,
    headers,
  });
};
