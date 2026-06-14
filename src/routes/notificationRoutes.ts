import { Router } from 'express';
import {
  getNotifications,
  getNotification,
  createNotification,
  sendNotification,
  deleteNotification,
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createFamilyReminder,
} from '../controllers/notificationController';
import { auditMiddleware } from '../middleware/audit';

const router = Router();

router.get(
  '/',
  auditMiddleware({
    action: 'list_notifications',
    resourceType: 'notification',
    logRequest: true,
  }),
  getNotifications
);

router.get(
  '/templates',
  auditMiddleware({
    action: 'list_templates',
    resourceType: 'template',
    logRequest: true,
  }),
  getTemplates
);

router.get(
  '/:id',
  auditMiddleware({
    action: 'get_notification',
    resourceType: 'notification',
    getResourceId: (req) => req.params.id,
  }),
  getNotification
);

router.post(
  '/',
  auditMiddleware({
    action: 'create_notification',
    resourceType: 'notification',
    logRequest: true,
    logResponse: true,
  }),
  createNotification
);

router.post(
  '/family-reminder',
  auditMiddleware({
    action: 'create_family_reminder',
    resourceType: 'notification',
    logRequest: true,
    logResponse: true,
  }),
  createFamilyReminder
);

router.post(
  '/:id/send',
  auditMiddleware({
    action: 'send_notification',
    resourceType: 'notification',
    getResourceId: (req) => req.params.id,
  }),
  sendNotification
);

router.delete(
  '/:id',
  auditMiddleware({
    action: 'delete_notification',
    resourceType: 'notification',
    getResourceId: (req) => req.params.id,
  }),
  deleteNotification
);

router.get(
  '/templates/:id',
  auditMiddleware({
    action: 'get_template',
    resourceType: 'template',
    getResourceId: (req) => req.params.id,
  }),
  getTemplate
);

router.post(
  '/templates',
  auditMiddleware({
    action: 'create_template',
    resourceType: 'template',
    logRequest: true,
    logResponse: true,
  }),
  createTemplate
);

router.put(
  '/templates/:id',
  auditMiddleware({
    action: 'update_template',
    resourceType: 'template',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  updateTemplate
);

router.delete(
  '/templates/:id',
  auditMiddleware({
    action: 'delete_template',
    resourceType: 'template',
    getResourceId: (req) => req.params.id,
  }),
  deleteTemplate
);

export default router;
