import { Router } from 'express';
import {
  createOrderFromTemplate,
  createOrderTemplate,
  deleteOrderTemplate,
  listOrderTemplates,
  updateOrderTemplate,
} from '../services/orderTemplateService.js';
import { getUserId } from './utils/index.js';

const router = Router();

const errorResponse = (res: Parameters<Parameters<typeof router.get>[1]>[1], error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  return res.status(400).json({ error: message });
};

router.get('/', (req, res) => {
  try {
    return res.json(listOrderTemplates(getUserId(req)));
  } catch (error) {
    console.error('获取商单模板失败:', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: '获取商单模板失败，请稍后重试' });
  }
});

router.post('/', (req, res) => {
  try {
    return res.json(createOrderTemplate(getUserId(req), req.body));
  } catch (error) {
    return errorResponse(res, error, '创建商单模板失败');
  }
});

router.put('/:id', (req, res) => {
  try {
    return res.json(updateOrderTemplate(getUserId(req), req.params.id, req.body));
  } catch (error) {
    return errorResponse(res, error, '更新商单模板失败');
  }
});

router.delete('/:id', (req, res) => {
  try {
    return res.json(deleteOrderTemplate(getUserId(req), req.params.id));
  } catch (error) {
    return errorResponse(res, error, '删除商单模板失败');
  }
});

router.post('/:id/create-order', (req, res) => {
  try {
    return res.json(createOrderFromTemplate(getUserId(req), req.params.id, req.body?.operationDate));
  } catch (error) {
    return errorResponse(res, error, '从模板创建商单失败');
  }
});

export default router;
