import { Router } from 'express';
import routes from './routes/index.js';
import externalApi from './externalApi.js';

const router = Router();

router.use('/', routes);
router.use('/external', externalApi);

export default router;