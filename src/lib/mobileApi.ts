export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform()) {
    const serverUrl = localStorage.getItem('kolflow_server_url');
    if (serverUrl) {
      return serverUrl.replace(/\/$/, '');
    }
  }
  return '';
};

export const getApiUrl = (path: string): string => {
  const base = getBaseUrl();
  return `${base}${path}`;
};

export const createAuthHeaders = (token?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const storedToken = token || localStorage.getItem('token');
  if (storedToken) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }
  return headers;
};

export const apiFetch = async (path: string, options: RequestInit = {}): Promise<Response> => {
  const url = getApiUrl(path);
  const headers = createAuthHeaders(options.headers?.['Authorization'] as string);
  
  return fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers as Record<string, string>,
    },
  });
};