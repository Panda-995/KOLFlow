import { Router } from 'express';
import {
  createPublishLink,
  createPublishLinksBatch,
  deletePublishLink,
  listPublishLinks,
  updatePublishLink,
} from '../services/publishLinkService.js';
import { getApiErrorMessage, getApiErrorStatus } from '../services/errors.js';
import { getUserId } from './utils/index.js';

const router = Router();

router.get('/:orderId', (req, res) => {
  try {
    return res.json(listPublishLinks(getUserId(req), req.params.orderId));
  } catch (error) {
    console.error('获取发布链接错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '获取发布链接失败，请稍后重试') });
  }
});

router.post('/', (req, res) => {
  try {
    return res.json(createPublishLink(getUserId(req), req.body));
  } catch (error) {
    console.error('创建发布链接错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '创建发布链接失败，请稍后重试') });
  }
});

router.post('/batch', (req, res) => {
  try {
    return res.json(createPublishLinksBatch(getUserId(req), req.body.orderId, req.body.links));
  } catch (error) {
    console.error('批量创建发布链接错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '批量创建发布链接失败，请稍后重试') });
  }
});

router.put('/:id', (req, res) => {
  try {
    return res.json(updatePublishLink(getUserId(req), req.params.id, req.body));
  } catch (error) {
    console.error('更新发布链接错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '更新发布链接失败，请稍后重试') });
  }
});

router.delete('/:id', (req, res) => {
  try {
    return res.json(deletePublishLink(getUserId(req), req.params.id));
  } catch (error) {
    console.error('删除发布链接错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '删除发布链接失败，请稍后重试') });
  }
});

export default router;
