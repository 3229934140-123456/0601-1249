import { Router } from 'express';
import {
  getSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  getPatientTimeline,
} from '../controllers/sessionController';
import { auditMiddleware } from '../middleware/audit';

const router = Router();

router.get(
  '/',
  auditMiddleware({
    action: 'list_sessions',
    resourceType: 'session',
    logRequest: true,
  }),
  getSessions
);

router.get(
  '/:id',
  auditMiddleware({
    action: 'get_session',
    resourceType: 'session',
    getResourceId: (req) => req.params.id,
  }),
  getSession
);

router.post(
  '/',
  auditMiddleware({
    action: 'create_session',
    resourceType: 'session',
    logRequest: true,
    logResponse: true,
    getResourceId: (_req, res) => {
      const data = (res as any).locals?.resourceId;
      return data;
    },
  }),
  createSession
);

router.put(
  '/:id',
  auditMiddleware({
    action: 'update_session',
    resourceType: 'session',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  updateSession
);

router.delete(
  '/:id',
  auditMiddleware({
    action: 'delete_session',
    resourceType: 'session',
    getResourceId: (req) => req.params.id,
  }),
  deleteSession
);

router.get(
  '/patient/:patientId/timeline',
  auditMiddleware({
    action: 'get_patient_timeline',
    resourceType: 'patient',
    getResourceId: (req) => req.params.patientId,
  }),
  getPatientTimeline
);

export default router;
