import { Router } from 'express';
import {
  getRiskAlerts,
  getRiskAlert,
  createRiskAlert,
  reviewRiskAlert,
  reopenRiskAlert,
  batchReview,
  batchOperation,
  getRiskDashboard,
  deleteRiskAlert,
  getRiskKeywordsList,
  detectRisksFromText,
} from '../controllers/riskController';
import { auditMiddleware } from '../middleware/audit';

const router = Router();

router.get(
  '/',
  auditMiddleware({
    action: 'list_risk_alerts',
    resourceType: 'risk_alert',
    logRequest: true,
  }),
  getRiskAlerts
);

router.get(
  '/keywords',
  auditMiddleware({
    action: 'get_risk_keywords',
    resourceType: 'risk_alert',
  }),
  getRiskKeywordsList
);

router.get(
  '/:id',
  auditMiddleware({
    action: 'get_risk_alert',
    resourceType: 'risk_alert',
    getResourceId: (req) => req.params.id,
  }),
  getRiskAlert
);

router.post(
  '/',
  auditMiddleware({
    action: 'create_risk_alert',
    resourceType: 'risk_alert',
    logRequest: true,
    logResponse: true,
  }),
  createRiskAlert
);

router.post(
  '/detect',
  auditMiddleware({
    action: 'detect_risks_from_text',
    resourceType: 'risk_alert',
    logRequest: true,
    logResponse: true,
  }),
  detectRisksFromText
);

router.post(
  '/:id/review',
  auditMiddleware({
    action: 'review_risk_alert',
    resourceType: 'risk_alert',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  reviewRiskAlert
);

router.post(
  '/:id/reopen',
  auditMiddleware({
    action: 'reopen_risk_alert',
    resourceType: 'risk_alert',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  reopenRiskAlert
);

router.post(
  '/batch/review',
  auditMiddleware({
    action: 'batch_review_risk_alerts',
    resourceType: 'risk_alert',
    logRequest: true,
  }),
  batchReview
);

router.delete(
  '/:id',
  auditMiddleware({
    action: 'delete_risk_alert',
    resourceType: 'risk_alert',
    getResourceId: (req) => req.params.id,
  }),
  deleteRiskAlert
);

export default router;
