import { Router } from 'express';
import sessionRoutes from './sessionRoutes';
import recordRoutes from './recordRoutes';
import summaryRoutes from './summaryRoutes';
import todoRoutes from './todoRoutes';
import riskRoutes from './riskRoutes';
import questionnaireRoutes from './questionnaireRoutes';
import notificationRoutes from './notificationRoutes';
import auditRoutes from './auditRoutes';
import deliveryRoutes from './deliveryRoutes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    code: 0,
    message: '服务正常运行',
    data: {
      timestamp: new Date().toISOString(),
      service: 'health-followup-ai-platform',
      version: '1.1.0',
    },
  });
});

router.use('/sessions', sessionRoutes);
router.use('/records', recordRoutes);
router.use('/summaries', summaryRoutes);
router.use('/todos', todoRoutes);
router.use('/risk-alerts', riskRoutes);
router.use('/questionnaires', questionnaireRoutes);
router.use('/notifications', notificationRoutes);
router.use('/audit', auditRoutes);
router.use('/delivery', deliveryRoutes);

export default router;
