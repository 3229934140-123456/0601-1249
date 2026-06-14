import { Router } from 'express';
import {
  getPendingDeliveries,
  getDeliveryDetail,
  getDeliveryPreview,
  getDeliveryRelatedRecords,
  getPatientDeliveryStats,
  getRelationshipView,
  savePendingDeliveries,
  confirmAndSendDeliveries,
  updateDelivery,
  cancelDelivery,
} from '../controllers/deliveryController';
import { auditMiddleware } from '../middleware/audit';

const router = Router();

router.get(
  '/',
  auditMiddleware({
    action: 'list_pending_deliveries',
    resourceType: 'delivery',
    logRequest: true,
  }),
  getPendingDeliveries
);

router.get(
  '/stats/patients',
  auditMiddleware({
    action: 'get_delivery_patient_stats',
    resourceType: 'delivery',
  }),
  getPatientDeliveryStats
);

router.get(
  '/relationship',
  auditMiddleware({
    action: 'get_delivery_relationship',
    resourceType: 'delivery',
    logRequest: true,
  }),
  getRelationshipView
);

router.get(
  '/:id',
  auditMiddleware({
    action: 'get_delivery',
    resourceType: 'delivery',
    getResourceId: (req) => req.params.id,
  }),
  getDeliveryDetail
);

router.get(
  '/:id/related',
  auditMiddleware({
    action: 'get_delivery_related',
    resourceType: 'delivery',
    getResourceId: (req) => req.params.id,
  }),
  getDeliveryRelatedRecords
);

router.post(
  '/preview',
  auditMiddleware({
    action: 'preview_delivery',
    resourceType: 'delivery',
    logRequest: true,
    logResponse: true,
  }),
  getDeliveryPreview
);

router.post(
  '/save',
  auditMiddleware({
    action: 'save_deliveries',
    resourceType: 'delivery',
    logRequest: true,
    logResponse: true,
  }),
  savePendingDeliveries
);

router.post(
  '/confirm-send',
  auditMiddleware({
    action: 'confirm_send_deliveries',
    resourceType: 'delivery',
    logRequest: true,
    logResponse: true,
  }),
  confirmAndSendDeliveries
);

router.put(
  '/:id',
  auditMiddleware({
    action: 'update_delivery',
    resourceType: 'delivery',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  updateDelivery
);

router.post(
  '/:id/cancel',
  auditMiddleware({
    action: 'cancel_delivery',
    resourceType: 'delivery',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  cancelDelivery
);

export default router;
