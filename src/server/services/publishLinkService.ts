import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { logActivity } from '../routes/utils/index.js';
import { ApiError } from './errors.js';

const PLATFORM_PATTERNS: Record<string, RegExp[]> = {
  '小红书': [/xiaohongshu\.com/, /xhslink\.com/, /小红书/],
  '值得买': [/zhihu\.com\/column/, /smzdm\.com/, /值得买/, /什么值得买/],
  '公众号': [/mp\.weixin\.qq\.com/, /公众号/],
  '小黑盒': [/xiaoheihe\.cn/, /小黑盒/, /heybox/],
  '百家号': [/baijiahao\.baidu\.com/, /百家号/],
  '微博': [/weibo\.com/, /weibo\.cn/, /微博/],
  '少数派': [/sspai\.com/, /少数派/],
  '头条': [/toutiao\.com/, /头条/, /今日头条/],
  '知乎': [/zhihu\.com/, /知乎/],
  'B站': [/bilibili\.com/, /b23\.tv/, /哔哩哔哩/, /B站/],
  '搜狐': [/sohu\.com/, /搜狐/],
  '大鱼号': [/dayu\.com/, /大鱼号/, /uc\.cn\/a/],
  'CSDN': [/csdn\.net/, /blog\.csdn\.net/, /CSDN/],
  '51CTO': [/51cto\.com/, /51CTO/],
  'UC': [/uc\.cn/, /UC浏览器/],
  '腾讯': [/qq\.com/, /tencent\.com/, /腾讯/],
  '抖音': [/douyin\.com/, /抖/, /tiktok/],
  '快手': [/kuaishou\.com/, /快手/],
  '微信公众号': [/mp\.weixin\.qq\.com/, /微信/],
  '大众点评': [/dianping\.com/, /大众点评/],
  '淘宝': [/taobao\.com/, /tmall\.com/, /淘宝/, /天猫/],
  '京东': [/jd\.com/, /京东/],
  '拼多多': [/pinduoduo\.com/, /yangkeduo\.com/, /拼多多/],
};

const detectPlatform = (url: string): string => {
  const normalizedUrl = url.toLowerCase();
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(normalizedUrl))) return platform;
  }
  return '其他';
};

const parsePrefixedUrl = (platform: unknown, url: string): { platform: string; url: string } => {
  if (typeof platform === 'string' && platform.trim()) return { platform: platform.trim(), url };

  const colonIndex = url.includes('：') ? url.indexOf('：') : url.indexOf(':');
  if (colonIndex > 0) {
    const prefix = url.slice(0, colonIndex).trim();
    if (prefix && !prefix.toLowerCase().includes('http')) {
      return { platform: prefix, url: url.slice(colonIndex + 1).trim() };
    }
  }
  return { platform: '', url };
};

export const normalizePublishLink = (platform: unknown, rawUrl: unknown): { platform: string; url: string } => {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) throw new ApiError('链接不能为空');
  const parsedInput = parsePrefixedUrl(platform, rawUrl.trim());
  if (!parsedInput.url) throw new ApiError('链接不能为空');

  const urlWithProtocol = /^[a-z][a-z\d+.-]*:/i.test(parsedInput.url)
    ? parsedInput.url
    : `https://${parsedInput.url}`;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlWithProtocol);
  } catch {
    throw new ApiError('链接格式无效');
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || !parsedUrl.hostname) {
    throw new ApiError('链接仅支持 HTTP 或 HTTPS');
  }
  if (parsedUrl.toString().length > 2048) throw new ApiError('链接不能超过2048个字符');

  const finalPlatform = parsedInput.platform || detectPlatform(parsedUrl.toString());
  if (finalPlatform.length > 50) throw new ApiError('平台名称不能超过50个字符');
  return { platform: finalPlatform, url: parsedUrl.toString() };
};

const ensureOwnedOrder = (userId: string, orderId: unknown): string => {
  if (typeof orderId !== 'string' || !orderId.trim()) throw new ApiError('商单ID不能为空');
  const normalizedOrderId = orderId.trim();
  if (!db.prepare('SELECT 1 FROM orders WHERE id = ? AND userId = ?').get(normalizedOrderId, userId)) {
    throw new ApiError('商单不存在', 404);
  }
  return normalizedOrderId;
};

export const listPublishLinks = (userId: string, orderId: string) => {
  const ownedOrderId = ensureOwnedOrder(userId, orderId);
  return db.prepare('SELECT * FROM publish_links WHERE orderId = ? AND userId = ? ORDER BY createdAt DESC').all(ownedOrderId, userId);
};

export const createPublishLink = (userId: string, input: { orderId?: unknown; platform?: unknown; url?: unknown }) => {
  const orderId = ensureOwnedOrder(userId, input.orderId);
  const normalized = normalizePublishLink(input.platform, input.url);
  const id = uuidv4();
  db.prepare(`
    INSERT INTO publish_links (id, orderId, userId, platform, url)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, orderId, userId, normalized.platform, normalized.url);
  logActivity(userId, 'create', 'publish_link', id, `添加发布链接: ${normalized.platform}`);
  return db.prepare('SELECT * FROM publish_links WHERE id = ? AND userId = ?').get(id, userId);
};

export const createPublishLinksBatch = (userId: string, orderIdValue: unknown, links: unknown) => {
  const orderId = ensureOwnedOrder(userId, orderIdValue);
  if (!Array.isArray(links) || links.length === 0) throw new ApiError('链接列表不能为空');
  if (links.length > 100) throw new ApiError('单次最多添加100个链接');

  const createdLinks: unknown[] = [];
  const errors: string[] = [];
  for (const [index, link] of links.entries()) {
    try {
      const normalized = normalizePublishLink(undefined, link);
      const id = uuidv4();
      db.prepare(`
        INSERT INTO publish_links (id, orderId, userId, platform, url)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, orderId, userId, normalized.platform, normalized.url);
      createdLinks.push(db.prepare('SELECT * FROM publish_links WHERE id = ? AND userId = ?').get(id, userId));
    } catch (error) {
      errors.push(`第${index + 1}条链接：${error instanceof Error ? error.message : '处理失败'}`);
    }
  }

  if (createdLinks.length) {
    logActivity(userId, 'batch_create', 'publish_link', orderId, `批量添加 ${createdLinks.length} 个发布链接`);
  }
  return { success: true, created: createdLinks.length, links: createdLinks, errors: errors.length ? errors : undefined };
};

export const updatePublishLink = (userId: string, id: string, input: { platform?: unknown; url?: unknown }) => {
  const existing = db.prepare('SELECT * FROM publish_links WHERE id = ? AND userId = ?').get(id, userId) as { platform: string; url: string } | undefined;
  if (!existing) throw new ApiError('链接不存在', 404);
  const normalized = normalizePublishLink(input.platform ?? existing.platform, input.url ?? existing.url);
  db.prepare('UPDATE publish_links SET platform = ?, url = ? WHERE id = ? AND userId = ?')
    .run(normalized.platform, normalized.url, id, userId);
  logActivity(userId, 'update', 'publish_link', id, `更新发布链接: ${normalized.platform}`);
  return db.prepare('SELECT * FROM publish_links WHERE id = ? AND userId = ?').get(id, userId);
};

export const deletePublishLink = (userId: string, id: string) => {
  const existing = db.prepare('SELECT platform FROM publish_links WHERE id = ? AND userId = ?').get(id, userId) as { platform: string } | undefined;
  if (!existing) throw new ApiError('链接不存在', 404);
  db.prepare('DELETE FROM publish_links WHERE id = ? AND userId = ?').run(id, userId);
  logActivity(userId, 'delete', 'publish_link', id, `删除发布链接: ${existing.platform}`);
  return { success: true };
};
