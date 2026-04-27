import { Router } from 'express';
import db from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { logActivity, getUserId } from './utils/index.js';

const router = Router();

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
  const lowerUrl = url.toLowerCase();
  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerUrl)) {
        return platform;
      }
    }
  }
  return '其他';
};

const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return url.startsWith('http://') || url.startsWith('https://');
  }
};

router.get('/:orderId', (req, res) => {
  const userId = getUserId(req);
  const { orderId } = req.params;
  const links = db.prepare('SELECT * FROM publish_links WHERE orderId = ? AND userId = ? ORDER BY createdAt DESC').all(orderId, userId);
  res.json(links);
});

router.post('/', (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderId, platform, url } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: '商单ID不能为空' });
    }

    const order = db.prepare('SELECT id FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as any;
    if (!order) {
      return res.status(404).json({ error: '商单不存在' });
    }

    let finalPlatform = platform;
    let finalUrl = url;

    if (url && !platform) {
      const chineseColonIndex = url.indexOf('：');
      const englishColonIndex = url.indexOf(':');
      
      if (chineseColonIndex > 0) {
        const parsedPlatform = url.substring(0, chineseColonIndex).trim();
        if (parsedPlatform && !parsedPlatform.toLowerCase().includes('http')) {
          finalPlatform = parsedPlatform;
          finalUrl = url.substring(chineseColonIndex + 1).trim();
        }
      } else if (englishColonIndex > 0) {
        const parsedPlatform = url.substring(0, englishColonIndex).trim();
        if (parsedPlatform && !parsedPlatform.toLowerCase().includes('http')) {
          finalPlatform = parsedPlatform;
          finalUrl = url.substring(englishColonIndex + 1).trim();
        }
      }
    }

    if (!finalUrl || finalUrl.trim().length === 0) {
      return res.status(400).json({ error: '链接不能为空' });
    }

    if (!finalPlatform) {
      finalPlatform = detectPlatform(finalUrl);
    }

    if (!isValidUrl(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO publish_links (id, orderId, userId, platform, url)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, orderId, userId, finalPlatform.trim(), finalUrl.trim());

    logActivity(userId, 'create', 'publish_link', id, `添加发布链接: ${finalPlatform}`);

    const newLink = db.prepare('SELECT * FROM publish_links WHERE id = ?').get(id);
    res.json(newLink);
  } catch (error) {
    console.error('创建发布链接错误:', error);
    res.status(500).json({ error: '创建发布链接失败，请稍后重试' });
  }
});

router.post('/batch', (req, res) => {
  try {
    const userId = getUserId(req);
    const { orderId, links } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: '商单ID不能为空' });
    }

    const order = db.prepare('SELECT id FROM orders WHERE id = ? AND userId = ?').get(orderId, userId) as any;
    if (!order) {
      return res.status(404).json({ error: '商单不存在' });
    }

    if (!links || !Array.isArray(links) || links.length === 0) {
      return res.status(400).json({ error: '链接列表不能为空' });
    }

    const createdLinks: any[] = [];
    const errors: string[] = [];

    for (const linkInput of links) {
      try {
        let platform = '';
        let url = linkInput.trim();

        if (!url) continue;

        const chineseColonIndex = url.indexOf('：');
        const englishColonIndex = url.indexOf(':');
        
        if (chineseColonIndex > 0) {
          const parsedPlatform = url.substring(0, chineseColonIndex).trim();
          if (parsedPlatform && !parsedPlatform.toLowerCase().includes('http')) {
            platform = parsedPlatform;
            url = url.substring(chineseColonIndex + 1).trim();
          }
        } else if (englishColonIndex > 0) {
          const parsedPlatform = url.substring(0, englishColonIndex).trim();
          if (parsedPlatform && !parsedPlatform.toLowerCase().includes('http')) {
            platform = parsedPlatform;
            url = url.substring(englishColonIndex + 1).trim();
          }
        }

        if (!url) {
          errors.push(`空链接已跳过`);
          continue;
        }

        if (!platform) {
          platform = detectPlatform(url);
        }

        if (!isValidUrl(url)) {
          url = 'https://' + url;
        }

        const id = uuidv4();
        db.prepare(`
          INSERT INTO publish_links (id, orderId, userId, platform, url)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, orderId, userId, platform.trim(), url.trim());

        const newLink = db.prepare('SELECT * FROM publish_links WHERE id = ?').get(id);
        createdLinks.push(newLink);
      } catch (e) {
        errors.push(`链接处理失败: ${linkInput.substring(0, 50)}...`);
      }
    }

    if (createdLinks.length > 0) {
      logActivity(userId, 'batch_create', 'publish_link', orderId, `批量添加 ${createdLinks.length} 个发布链接`);
    }

    res.json({ 
      success: true, 
      created: createdLinks.length, 
      links: createdLinks,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('批量创建发布链接错误:', error);
    res.status(500).json({ error: '批量创建发布链接失败，请稍后重试' });
  }
});

router.put('/:id', (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;
  const { platform, url } = req.body;

  const existingLink = db.prepare('SELECT * FROM publish_links WHERE id = ? AND userId = ?').get(id, userId) as any;
  if (!existingLink) {
    return res.status(404).json({ error: '链接不存在' });
  }

  let newPlatform = platform || existingLink.platform;
  let newUrl = url || existingLink.url;

  if (url && !platform) {
    const chineseColonIndex = url.indexOf('：');
    const englishColonIndex = url.indexOf(':');
    
    if (chineseColonIndex > 0) {
      const parsedPlatform = url.substring(0, chineseColonIndex).trim();
      if (parsedPlatform && !parsedPlatform.toLowerCase().includes('http')) {
        newPlatform = parsedPlatform;
        newUrl = url.substring(chineseColonIndex + 1).trim();
      }
    } else if (englishColonIndex > 0) {
      const parsedPlatform = url.substring(0, englishColonIndex).trim();
      if (parsedPlatform && !parsedPlatform.toLowerCase().includes('http')) {
        newPlatform = parsedPlatform;
        newUrl = url.substring(englishColonIndex + 1).trim();
      }
    }
  }

  if (!isValidUrl(newUrl)) {
    newUrl = 'https://' + newUrl;
  }

  db.prepare('UPDATE publish_links SET platform = ?, url = ? WHERE id = ?').run(newPlatform, newUrl, id);

  logActivity(userId, 'update', 'publish_link', id, `更新发布链接: ${newPlatform}`);

  const updatedLink = db.prepare('SELECT * FROM publish_links WHERE id = ?').get(id);
  res.json(updatedLink);
});

router.delete('/:id', (req, res) => {
  const userId = getUserId(req);
  const { id } = req.params;

  const link = db.prepare('SELECT * FROM publish_links WHERE id = ? AND userId = ?').get(id, userId) as any;
  if (link) {
    logActivity(userId, 'delete', 'publish_link', id, `删除发布链接: ${link.platform}`);
  }

  db.prepare('DELETE FROM publish_links WHERE id = ? AND userId = ?').run(id, userId);
  res.json({ success: true });
});

export default router;