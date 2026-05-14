import { Router } from 'express';
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
import publishLinksRouter from './publishLinks.js';
import assetsRouter from './assets.js';

const router = Router();

router.use('/orders', ordersRouter);
router.use('/todos', todosRouter);
router.use('/brands', brandsRouter);
router.use('/payments', paymentsRouter);
router.use('/settings', settingsRouter);
router.use('/auth', authRouter);
router.use('/logs', logsRouter);
router.use('/comments', commentsRouter);
router.use('/data', dataRouter);
router.use('/report', reportRouter);
router.use('/publish-links', publishLinksRouter);
router.use('/assets', assetsRouter);

export default router;