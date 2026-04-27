// 通用辅助函数

import crypto from 'crypto';

// 安全的 JSON 解析
export const safeJsonParse = <T = any>(str: string | null | undefined, fallback: T): T => {
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
  const random = crypto.randomBytes(3).toString('hex');
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
  if (password.length > 128) {
    return { valid: false, message: '密码长度不能超过128位' };
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
export const validateAmount = (amount: any): boolean => {
  if (amount === undefined || amount === null) return true;
  const num = Number(amount);
  return !isNaN(num) && num >= 0 && num <= 99999999;
};