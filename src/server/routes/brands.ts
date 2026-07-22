import { Router } from 'express';
import { createBrand, deleteBrand, getBrand, listBrands, updateBrand } from '../services/brandService.js';
import { getApiErrorMessage, getApiErrorStatus } from '../services/errors.js';
import { getUserId } from './utils/index.js';

const router = Router();

router.get('/', (req, res) => {
  try {
    return res.json(listBrands(getUserId(req)));
  } catch (error) {
    console.error('获取品牌列表错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '获取品牌列表失败，请稍后重试') });
  }
});

router.get('/:id', (req, res) => {
  try {
    return res.json(getBrand(getUserId(req), req.params.id));
  } catch (error) {
    console.error('获取品牌详情错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '获取品牌详情失败，请稍后重试') });
  }
});

router.post('/', (req, res) => {
  try {
    return res.json(createBrand(getUserId(req), req.body));
  } catch (error) {
    console.error('创建品牌错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '创建品牌失败，请稍后重试') });
  }
});

router.put('/:id', (req, res) => {
  try {
    return res.json(updateBrand(getUserId(req), req.params.id, req.body));
  } catch (error) {
    console.error('更新品牌错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '更新品牌失败，请稍后重试') });
  }
});

router.delete('/:id', (req, res) => {
  try {
    return res.json(deleteBrand(getUserId(req), req.params.id));
  } catch (error) {
    console.error('删除品牌错误:', error instanceof Error ? error.message : error);
    return res.status(getApiErrorStatus(error)).json({ error: getApiErrorMessage(error, '删除品牌失败，请稍后重试') });
  }
});

export default router;
