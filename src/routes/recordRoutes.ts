import { Router } from 'express';
import {
  getRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  mergeRecords,
  extractRecordInfo,
} from '../controllers/recordController';
import { auditMiddleware } from '../middleware/audit';

const router = Router();

router.get(
  '/',
  auditMiddleware({
    action: 'list_records',
    resourceType: 'record',
    logRequest: true,
  }),
  getRecords
);

router.get(
  '/:id',
  auditMiddleware({
    action: 'get_record',
    resourceType: 'record',
    getResourceId: (req) => req.params.id,
  }),
  getRecord
);

router.post(
  '/',
  auditMiddleware({
    action: 'create_record',
    resourceType: 'record',
    logRequest: true,
    logResponse: true,
  }),
  createRecord
);

router.put(
  '/:id',
  auditMiddleware({
    action: 'update_record',
    resourceType: 'record',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  updateRecord
);

router.delete(
  '/:id',
  auditMiddleware({
    action: 'delete_record',
    resourceType: 'record',
    getResourceId: (req) => req.params.id,
  }),
  deleteRecord
);

router.post(
  '/merge',
  auditMiddleware({
    action: 'merge_records',
    resourceType: 'record',
    logRequest: true,
    logResponse: true,
  }),
  mergeRecords
);

router.get(
  '/:id/extract',
  auditMiddleware({
    action: 'extract_record_info',
    resourceType: 'record',
    getResourceId: (req) => req.params.id,
  }),
  extractRecordInfo
);

export default router;
