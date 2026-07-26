import express, { type Express } from 'express';

export const DEFAULT_JSON_BODY_LIMIT = '10mb';
export const IMPORT_JSON_BODY_LIMIT = '100mb';

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
    ? '导入数据超过 100 MB 上限'
    : '请求实体超过 10 MB 上限'
);
