import { Router } from 'express';
import {
  getQuestionnaires,
  getQuestionnaire,
  createQuestionnaire,
  updateQuestionnaire,
  deleteQuestionnaire,
  getRecommendations,
  getRecommendation,
  recommendForPatient,
  updateRecommendationStatus,
} from '../controllers/questionnaireController';
import { auditMiddleware } from '../middleware/audit';

const router = Router();

router.get(
  '/',
  auditMiddleware({
    action: 'list_questionnaires',
    resourceType: 'questionnaire',
    logRequest: true,
  }),
  getQuestionnaires
);

router.get(
  '/recommendations',
  auditMiddleware({
    action: 'list_recommendations',
    resourceType: 'questionnaire',
    logRequest: true,
  }),
  getRecommendations
);

router.get(
  '/recommendations/:id',
  auditMiddleware({
    action: 'get_recommendation',
    resourceType: 'questionnaire',
    getResourceId: (req) => req.params.id,
  }),
  getRecommendation
);

router.get(
  '/:id',
  auditMiddleware({
    action: 'get_questionnaire',
    resourceType: 'questionnaire',
    getResourceId: (req) => req.params.id,
  }),
  getQuestionnaire
);

router.post(
  '/',
  auditMiddleware({
    action: 'create_questionnaire',
    resourceType: 'questionnaire',
    logRequest: true,
    logResponse: true,
  }),
  createQuestionnaire
);

router.post(
  '/recommend',
  auditMiddleware({
    action: 'recommend_questionnaires',
    resourceType: 'questionnaire',
    logRequest: true,
    logResponse: true,
  }),
  recommendForPatient
);

router.put(
  '/:id',
  auditMiddleware({
    action: 'update_questionnaire',
    resourceType: 'questionnaire',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  updateQuestionnaire
);

router.post(
  '/recommendations/:id/status',
  auditMiddleware({
    action: 'update_recommendation_status',
    resourceType: 'questionnaire',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  updateRecommendationStatus
);

router.delete(
  '/:id',
  auditMiddleware({
    action: 'delete_questionnaire',
    resourceType: 'questionnaire',
    getResourceId: (req) => req.params.id,
  }),
  deleteQuestionnaire
);

export default router;
