import express, { type Express } from 'express';

export const DEFAULT_JSON_BODY_LIMIT = '10mb';
// 完整备份可能包含大量 Base64 资产图片；可通过 IMPORT_BODY_LIMIT 调整（如 512mb）
export const IMPORT_JSON_BODY_LIMIT = process.env.IMPORT_BODY_LIMIT?.trim() || '100mb';

/** 把上限字符串（如 100mb）换算为字节数，用于导出侧的体积预警 */
export const parseBodyLimitBytes = (limit: string): number => {
  const match = limit.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2] || 'b';
  const factor = unit === 'gb' ? 1024 ** 3 : unit === 'mb' ? 1024 ** 2 : unit === 'kb' ? 1024 : 1;
  return Math.floor(value * factor);
};

/**
 * 导出体积按 UTF-8 字节数衡量：JSON.stringify 的结果是 UTF-16 码元个数，
 * 中文/emoji 会被低估（中文字符占 3 字节但只算 1 个长度），
 * 用字符串长度判断"是否接近请求体上限"会漏报，导出成功但恢复时超限。
 */
export const measureUtf8Bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

/** 体积接近上限（≥95%）时的预警文案；未接近则返回 null */
export const buildExportSizeWarning = (serialized: string, limitBytes: number, limitLabel: string): string | null => {
  if (limitBytes <= 0) return null;
  const bytes = measureUtf8Bytes(serialized);
  if (bytes <= limitBytes * 0.95) return null;
  return `备份体积约 ${(bytes / 1024 / 1024).toFixed(1)} MB，接近导入上限 ${limitLabel}，` +
    '恢复时可能失败（可清理操作日志/资产图片，或调整 IMPORT_BODY_LIMIT）';
};

const isImportPath = (requestPath: string): boolean => {
  const path = requestPath.split('?', 1)[0];
  return path === '/api/data/import' || path.startsWith('/api/data/import/');
};

export const configureJsonBodyParsers = (app: Express): void => {
  // Backups can contain Base64 asset images, so only the full-data import
  // endpoints receive the larger allowance.
  app.use('/api/data/import', express.json({ limit: IMPORT_JSON_BODY_LIMIT }));
  app.use(express.json({ limit: DEFAULT_JSON_BODY_LIMIT }));
};

export const getPayloadTooLargeMessage = (requestPath: string): string => (
  isImportPath(requestPath)
    ? `导入数据超过 ${IMPORT_JSON_BODY_LIMIT} 上限（可通过 IMPORT_BODY_LIMIT 调整）`
    : '请求实体超过 10 MB 上限'
);
