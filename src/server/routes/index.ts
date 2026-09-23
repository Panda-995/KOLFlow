import { Router } from 'express';
import compression from 'compression';
import ordersRouter from './orders.js';
import todosRouter from './todos.js';
import brandsRouter from './brands.js';
import paymentsRouter from './payments.js';
import settingsRouter from './settings.js';
import authRouter from './auth.js';
import logsRouter from './logs.js';
import commentsRouter from './comments.js';
import dataRouter from './data.js';
import reportRouter from './report.js';
import dashboardRouter from './dashboard.js';
import publishLinksRouter from './publishLinks.js';
import paidPromotionsRouter from './paidPromotions.js';
import assetsRouter from './assets.js';
import orderTemplatesRouter from './orderTemplates.js';
import { authMiddleware } from './utils/index.js';

const router = Router();

router.use('/auth', authRouter);
router.use(authMiddleware);
// 大型业务列表保持原有响应结构，同时按客户端能力压缩传输。
const compressLists = compression({
  threshold: 1024,
  filter: (req, res) => req.method === 'GET' && compression.filter(req, res),
});
router.use(['/orders', '/todos', '/brands', '/payments', '/assets'], compressLists);
router.use('/orders', ordersRouter);
router.use('/order-templates', orderTemplatesRouter);
router.use('/todos', todosRouter);
router.use('/brands', brandsRouter);
router.use('/payments', paymentsRouter);
router.use('/settings', settingsRouter);
router.use('/logs', logsRouter);
router.use('/comments', commentsRouter);
router.use('/data', dataRouter);
router.use('/report', reportRouter);
router.use('/dashboard', dashboardRouter);
router.use('/publish-links', publishLinksRouter);
router.use('/paid-promotions', paidPromotionsRouter);
router.use('/assets', assetsRouter);

export default router;
