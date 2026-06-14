import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { success, notFound, paginated, badRequest } from '../utils/response';
import { Todo } from '../types';

const rowToTodo = (row: any): Todo => ({
  id: row.id,
  patientId: row.patient_id,
  sessionId: row.session_id,
  title: row.title,
  description: row.description,
  type: row.type,
  priority: row.priority,
  status: row.status,
  dueDate: row.due_date,
  assignedTo: row.assigned_to,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getTodos = (req: Request, res: Response): void => {
  const { patientId, sessionId, type, priority, status, assignedTo, page = 1, pageSize = 10 } = req.query;

  const pageNum = Number(page);
  const pageSizeNum = Number(pageSize);
  const offset = (pageNum - 1) * pageSizeNum;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (patientId) {
    whereClause += ' AND patient_id = ?';
    params.push(patientId);
  }
  if (sessionId) {
    whereClause += ' AND session_id = ?';
    params.push(sessionId);
  }
  if (type) {
    whereClause += ' AND type = ?';
    params.push(type);
  }
  if (priority) {
    whereClause += ' AND priority = ?';
    params.push(priority);
  }
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  if (assignedTo) {
    whereClause += ' AND assigned_to = ?';
    params.push(assignedTo);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM todos ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM todos ${whereClause}
    ORDER BY
      CASE priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END,
      created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const todos = rows.map(rowToTodo);

  paginated(res, todos, total, pageNum, pageSizeNum);
};

export const getTodo = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM todos WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '待办不存在');
    return;
  }

  success(res, rowToTodo(row));
};

export const createTodo = (req: Request, res: Response): void => {
  const {
    patientId,
    sessionId,
    title,
    description,
    type = 'other',
    priority = 'medium',
    status = 'pending',
    dueDate,
    assignedTo,
  } = req.body;

  if (!patientId || !title) {
    badRequest(res, '患者ID和标题不能为空');
    return;
  }

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO todos (id, patient_id, session_id, title, description, type, priority, status, due_date, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    patientId,
    sessionId || null,
    title,
    description || null,
    type,
    priority,
    status,
    dueDate || null,
    assignedTo || null
  );

  const getStmt = db.prepare('SELECT * FROM todos WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToTodo(row), '创建成功');
};

export const createFollowUpTodo = (req: Request, res: Response): void => {
  const { patientId, sessionId, dueDate, assignedTo, title } = req.body;

  if (!patientId) {
    badRequest(res, '患者ID不能为空');
    return;
  }

  const id = uuidv4();
  const todoTitle = title || '复诊随访';

  const stmt = db.prepare(`
    INSERT INTO todos (id, patient_id, session_id, title, description, type, priority, status, due_date, assigned_to)
    VALUES (?, ?, ?, ?, ?, 'followup', 'medium', 'pending', ?, ?)
  `);
  stmt.run(
    id,
    patientId,
    sessionId || null,
    todoTitle,
    '请按时进行复诊随访',
    dueDate || null,
    assignedTo || null
  );

  const getStmt = db.prepare('SELECT * FROM todos WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToTodo(row), '复诊待办创建成功');
};

export const updateTodo = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { title, description, type, priority, status, dueDate, assignedTo } = req.body;

  const checkStmt = db.prepare('SELECT id FROM todos WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '待办不存在');
    return;
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    params.push(description);
  }
  if (type !== undefined) {
    updates.push('type = ?');
    params.push(type);
  }
  if (priority !== undefined) {
    updates.push('priority = ?');
    params.push(priority);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }
  if (dueDate !== undefined) {
    updates.push('due_date = ?');
    params.push(dueDate);
  }
  if (assignedTo !== undefined) {
    updates.push('assigned_to = ?');
    params.push(assignedTo);
  }

  if (updates.length === 0) {
    badRequest(res, '没有需要更新的字段');
    return;
  }

  updates.push('updated_at = datetime("now")');
  params.push(id);

  const stmt = db.prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  const getStmt = db.prepare('SELECT * FROM todos WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToTodo(row), '更新成功');
};

export const deleteTodo = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT id FROM todos WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '待办不存在');
    return;
  }

  const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
  stmt.run(id);

  success(res, null, '删除成功');
};
