import { Router } from 'express';
import {
  getSummaries,
  getSummary,
  createSummary,
  generateSummaryFromRecords,
  updateSummary,
  confirmSummary,
  deleteSummary,
  exportSummary,
  hideSensitiveInSummary,
} from '../controllers/summaryController';
import { auditMiddleware } from '../middleware/audit';

const router = Router();

router.get(
  '/',
  auditMiddleware({
    action: 'list_summaries',
    resourceType: 'summary',
    logRequest: true,
  }),
  getSummaries
);

router.get(
  '/:id',
  auditMiddleware({
    action: 'get_summary',
    resourceType: 'summary',
    getResourceId: (req) => req.params.id,
  }),
  getSummary
);

router.post(
  '/',
  auditMiddleware({
    action: 'create_summary',
    resourceType: 'summary',
    logRequest: true,
    logResponse: true,
  }),
  createSummary
);

router.post(
  '/generate',
  auditMiddleware({
    action: 'generate_summary',
    resourceType: 'summary',
    logRequest: true,
    logResponse: true,
  }),
  generateSummaryFromRecords
);

router.put(
  '/:id',
  auditMiddleware({
    action: 'update_summary',
    resourceType: 'summary',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  updateSummary
);

router.post(
  '/:id/confirm',
  auditMiddleware({
    action: 'confirm_summary',
    resourceType: 'summary',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  confirmSummary
);

router.delete(
  '/:id',
  auditMiddleware({
    action: 'delete_summary',
    resourceType: 'summary',
    getResourceId: (req) => req.params.id,
  }),
  deleteSummary
);

router.get(
  '/:id/export',
  auditMiddleware({
    action: 'export_summary',
    resourceType: 'summary',
    getResourceId: (req) => req.params.id,
  }),
  exportSummary
);

router.post(
  '/:id/hide-sensitive',
  auditMiddleware({
    action: 'hide_sensitive_in_summary',
    resourceType: 'summary',
    getResourceId: (req) => req.params.id,
  }),
  hideSensitiveInSummary
);

export default router;
