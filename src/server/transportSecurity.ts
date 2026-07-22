import type { RequestHandler } from 'express';

type HttpsEnvironment = {
  NODE_ENV?: string;
  ENFORCE_HTTPS?: string;
};

export const getHttpsEnforcementPolicy = (environment: HttpsEnvironment): boolean => {
  return environment.NODE_ENV === 'production' && environment.ENFORCE_HTTPS?.toLowerCase() !== 'false';
};

export const resolveTrustProxy = (value: string | undefined): false | number | string => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'false' || normalized === '0') return false;
  if (normalized === 'true') return 1;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return value!.trim();
};

export const shouldRejectInsecureApiRequest = (
  enforceHttps: boolean,
  isSecure: boolean,
  path: string,
): boolean => enforceHttps && !isSecure && path.replace(/\/+$/, '') !== '/health';

export const createRequireHttpsMiddleware = (enforceHttps: boolean): RequestHandler => {
  return (req, res, next): void => {
    if (!shouldRejectInsecureApiRequest(enforceHttps, req.secure, req.path)) {
      next();
      return;
    }

    res.status(426).json({
      error: '生产环境仅允许通过 HTTPS 访问 API，请配置有效证书后重试',
    });
  };
};
