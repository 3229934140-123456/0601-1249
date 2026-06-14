import { Router } from 'express';
import {
  getAuditLogs,
  getAuditLog,
  getRetractedContents,
  retractContent,
  restoreContent,
  getDoctorNotes,
  getDoctorNote,
  createDoctorNote,
  updateDoctorNote,
  deleteDoctorNote,
} from '../controllers/auditController';
import { auditMiddleware } from '../middleware/audit';

const router = Router();

router.get(
  '/logs',
  auditMiddleware({
    action: 'list_audit_logs',
    resourceType: 'audit',
    logRequest: true,
  }),
  getAuditLogs
);

router.get(
  '/logs/:id',
  auditMiddleware({
    action: 'get_audit_log',
    resourceType: 'audit',
    getResourceId: (req) => req.params.id,
  }),
  getAuditLog
);

router.get(
  '/retracted',
  auditMiddleware({
    action: 'list_retracted_contents',
    resourceType: 'retracted_content',
    logRequest: true,
  }),
  getRetractedContents
);

router.post(
  '/retract',
  auditMiddleware({
    action: 'retract_content',
    resourceType: 'retracted_content',
    logRequest: true,
    logResponse: true,
  }),
  retractContent
);

router.post(
  '/retracted/:id/restore',
  auditMiddleware({
    action: 'restore_content',
    resourceType: 'retracted_content',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  restoreContent
);

router.get(
  '/doctor-notes',
  auditMiddleware({
    action: 'list_doctor_notes',
    resourceType: 'doctor_note',
    logRequest: true,
  }),
  getDoctorNotes
);

router.get(
  '/doctor-notes/:id',
  auditMiddleware({
    action: 'get_doctor_note',
    resourceType: 'doctor_note',
    getResourceId: (req) => req.params.id,
  }),
  getDoctorNote
);

router.post(
  '/doctor-notes',
  auditMiddleware({
    action: 'create_doctor_note',
    resourceType: 'doctor_note',
    logRequest: true,
    logResponse: true,
  }),
  createDoctorNote
);

router.put(
  '/doctor-notes/:id',
  auditMiddleware({
    action: 'update_doctor_note',
    resourceType: 'doctor_note',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  updateDoctorNote
);

router.delete(
  '/doctor-notes/:id',
  auditMiddleware({
    action: 'delete_doctor_note',
    resourceType: 'doctor_note',
    getResourceId: (req) => req.params.id,
  }),
  deleteDoctorNote
);

export default router;
