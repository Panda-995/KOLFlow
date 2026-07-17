import { Capacitor, CapacitorHttp, type HttpOptions } from '@capacitor/core';

export const SERVER_BASE_URL_KEY = 'kolflow.serverBaseUrl';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const normalizeServerUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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

  const runtime = (window as any).Capacitor;
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
  if (normalized && isNativeAppRuntime() && new URL(normalized).protocol !== 'https:') {
    throw new Error('为保护邮箱、密码和邀请码等个人信息，APP 仅允许连接 HTTPS 服务地址');
  }
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

  const parsedUrl = new URL(normalized);
  if (parsedUrl.protocol !== 'https:') {
    return '为保护邮箱、密码和邀请码等个人信息，APP 仅允许连接 HTTPS 服务地址。请先为 KOLFlow 服务配置有效的 HTTPS 证书。';
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.startsWith('127.')
  ) {
    return 'APP 内不能使用 localhost 或 127.0.0.1。请使用已配置有效 HTTPS 证书的域名。';
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
    return `无法安全连接服务端。请确认服务端正在运行、HTTPS 证书有效，并使用可从当前设备访问的 HTTPS 域名。${suffix}`;
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

export const apiFetch = async (path: string, options: RequestInit = {}): Promise<Response> => {
  const headers = new Headers(options.headers);
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

    const nativeResponse = await CapacitorHttp.request(nativeOptions);
    return createResponseFromNative(nativeResponse.data, nativeResponse.status, nativeResponse.headers);
  }

  return fetch(url, {
    ...options,
    headers,
  });
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
