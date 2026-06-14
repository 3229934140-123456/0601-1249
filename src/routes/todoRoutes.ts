import { Router } from 'express';
import {
  getTodos,
  getTodo,
  createTodo,
  createFollowUpTodo,
  updateTodo,
  deleteTodo,
} from '../controllers/todoController';
import { auditMiddleware } from '../middleware/audit';

const router = Router();

router.get(
  '/',
  auditMiddleware({
    action: 'list_todos',
    resourceType: 'todo',
    logRequest: true,
  }),
  getTodos
);

router.get(
  '/:id',
  auditMiddleware({
    action: 'get_todo',
    resourceType: 'todo',
    getResourceId: (req) => req.params.id,
  }),
  getTodo
);

router.post(
  '/',
  auditMiddleware({
    action: 'create_todo',
    resourceType: 'todo',
    logRequest: true,
    logResponse: true,
  }),
  createTodo
);

router.post(
  '/followup',
  auditMiddleware({
    action: 'create_followup_todo',
    resourceType: 'todo',
    logRequest: true,
    logResponse: true,
  }),
  createFollowUpTodo
);

router.put(
  '/:id',
  auditMiddleware({
    action: 'update_todo',
    resourceType: 'todo',
    getResourceId: (req) => req.params.id,
    logRequest: true,
  }),
  updateTodo
);

router.delete(
  '/:id',
  auditMiddleware({
    action: 'delete_todo',
    resourceType: 'todo',
    getResourceId: (req) => req.params.id,
  }),
  deleteTodo
);

export default router;
