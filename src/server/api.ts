import { Router } from 'express';
import routes from './routes/index.js';
import externalApi from './externalApi.js';

const router = Router();

router.use('/external', externalApi);
router.use('/', routes);

export default router;
