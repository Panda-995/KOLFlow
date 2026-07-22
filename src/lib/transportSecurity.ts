export const INSECURE_API_TRANSPORT_MESSAGE =
  '目标地址使用不安全的 HTTP 连接。为保护邮箱、密码、邀请码和业务数据，KOLFlow 已阻止发送请求。请改用配置了有效证书的 HTTPS 地址。';

const isLoopbackHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost' || normalized === '::1' || normalized.startsWith('127.');
};

const isHealthCheck = (pathname: string): boolean => pathname.replace(/\/+$/, '') === '/api/health';

export const getInsecureHttpTransportError = (
  requestUrl: string,
  pageUrl = typeof window !== 'undefined' ? window.location.href : '',
): string | null => {
  try {
    const target = pageUrl ? new URL(requestUrl, pageUrl) : new URL(requestUrl);
    if (target.protocol === 'https:') return null;
    if (target.protocol === 'http:' && isLoopbackHostname(target.hostname)) return null;
    if (target.protocol === 'http:') return INSECURE_API_TRANSPORT_MESSAGE;
  } catch {
    // Invalid URLs are handled by the normal request path and never weakened here.
  }

  return null;
};

/**
 * Returns an error before fetch() is called when a browser would send API data
 * over cleartext HTTP. Loopback HTTP remains available for local development.
 */
export const getInsecureApiTransportError = (
  requestUrl: string,
  pageUrl = typeof window !== 'undefined' ? window.location.href : '',
): string | null => {
  try {
    const target = pageUrl ? new URL(requestUrl, pageUrl) : new URL(requestUrl);
    if (isHealthCheck(target.pathname)) return null;
  } catch {
    return null;
  }

  return getInsecureHttpTransportError(requestUrl, pageUrl);
};
