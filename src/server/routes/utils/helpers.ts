// 通用辅助函数

import crypto from 'crypto';

// 安全的 JSON 解析
export const safeJsonParse = <T = unknown>(str: string | null | undefined, fallback: T): T => {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

// 生成订单号（使用加密安全的随机数）
export const generateOrderNo = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  const random = crypto.randomBytes(6).toString('hex');
  return `ORD-${year}${month}${day}-${hour}${minute}${second}-${random}`;
};

// 安全的日期解析
export const safeParseDate = (dateStr: string | null | undefined): Date | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

// 验证日期是否有效
export const isValidDate = (dateStr: string | null | undefined): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
};

// 业务日期统一按应用时区生成。默认 Asia/Shanghai，与报告周期口径一致；
// 容器（尤其 Docker/NAS）通常没有 TZ 设置，用机器本地时区会让东八区早 8 点前
// 生成的日期差一天，因此这里显式指定时区，可用 APP_TIMEZONE 覆盖。
export const APP_TIME_ZONE = process.env.APP_TIMEZONE?.trim() || 'Asia/Shanghai';

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const getDateFormatter = (): Intl.DateTimeFormat => {
  let formatter = dateFormatterCache.get(APP_TIME_ZONE);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    dateFormatterCache.set(APP_TIME_ZONE, formatter);
  }
  return formatter;
};

export const formatLocalDate = (date: Date = new Date()): string => {
  // en-CA 输出形如 YYYY-MM-DD
  return getDateFormatter().format(date);
};

export const isValidDateOnly = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

// 列表接口的可选分页参数：不传则保持全量返回（向后兼容），
// 传入 ?limit=&offset= 时由服务端分页，为数据增长后的扩展机制。
export const parseListPaging = (query: Record<string, unknown>): { limit?: number; offset?: number } => {
  const limit = Number(query.limit);
  const offset = Number(query.offset);
  return {
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : undefined,
    offset: Number.isInteger(offset) && offset > 0 ? offset : undefined,
  };
};

// 数据验证 - 邮箱
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// 数据验证 - 密码
export const validatePassword = (password: string): { valid: boolean; message: string } => {
  if (password.length < 6) {
    return { valid: false, message: '密码长度至少6位' };
  }
  // bcrypt 只使用前 72 字节，超长部分会被静默截断，导致超长密码互相可验证
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return { valid: false, message: '密码过长：不能超过72个字节（中文等非ASCII字符每个占3字节）' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: '密码需包含至少一个字母' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: '密码需包含至少一个数字' };
  }
  return { valid: true, message: '' };
};

// 数据验证 - 电话
export const validatePhone = (phone: string): boolean => {
  if (!phone) return true;
  const phoneRegex = /^1[3-9]\d{9}$/;
  // 国内手机号必须符合正则，其他格式允许长度不超过20
  if (phone.startsWith('1') && phone.length === 11) {
    return phoneRegex.test(phone);
  }
  return phone.length > 0 && phone.length <= 20;
};

// 数据验证 - 金额
export const validateAmount = (amount: unknown): boolean => {
  if (amount === undefined || amount === null) return true;
  const num = Number(amount);
  return !isNaN(num) && num >= 0 && num <= 99999999;
};
