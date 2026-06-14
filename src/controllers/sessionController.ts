import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { success, error, notFound, paginated, badRequest } from '../utils/response';
import { Session } from '../types';

const rowToSession = (row: any): Session => ({
  id: row.id,
  patientId: row.patient_id,
  doctorId: row.doctor_id,
  title: row.title,
  status: row.status,
  startTime: row.start_time,
  endTime: row.end_time,
  summary: row.summary,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getSessions = (req: Request, res: Response): void => {
  const { patientId, doctorId, status, page = 1, pageSize = 10 } = req.query;

  const pageNum = Number(page);
  const pageSizeNum = Number(pageSize);
  const offset = (pageNum - 1) * pageSizeNum;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (patientId) {
    whereClause += ' AND patient_id = ?';
    params.push(patientId);
  }
  if (doctorId) {
    whereClause += ' AND doctor_id = ?';
    params.push(doctorId);
  }
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM sessions ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM sessions ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const sessions = rows.map(rowToSession);

  paginated(res, sessions, total, pageNum, pageSizeNum);
};

export const getSession = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '会话不存在');
    return;
  }

  success(res, rowToSession(row));
};

export const createSession = (req: Request, res: Response): void => {
  const { patientId, doctorId, title, startTime } = req.body;

  if (!patientId || !title) {
    badRequest(res, '患者ID和标题不能为空');
    return;
  }

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO sessions (id, patient_id, doctor_id, title, start_time)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, patientId, doctorId || null, title, startTime || null);

  const getStmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToSession(row), '创建成功');
};

export const updateSession = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { title, status, startTime, endTime, summary, doctorId } = req.body;

  const checkStmt = db.prepare('SELECT id FROM sessions WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '会话不存在');
    return;
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }
  if (startTime !== undefined) {
    updates.push('start_time = ?');
    params.push(startTime);
  }
  if (endTime !== undefined) {
    updates.push('end_time = ?');
    params.push(endTime);
  }
  if (summary !== undefined) {
    updates.push('summary = ?');
    params.push(summary);
  }
  if (doctorId !== undefined) {
    updates.push('doctor_id = ?');
    params.push(doctorId);
  }

  if (updates.length === 0) {
    badRequest(res, '没有需要更新的字段');
    return;
  }

  updates.push('updated_at = datetime("now")');
  params.push(id);

  const stmt = db.prepare(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  const getStmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToSession(row), '更新成功');
};

export const deleteSession = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT id FROM sessions WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '会话不存在');
    return;
  }

  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  stmt.run(id);

  success(res, null, '删除成功');
};

export const getPatientTimeline = (req: Request, res: Response): void => {
  const { patientId } = req.params;
  const { page = 1, pageSize = 20 } = req.query;

  const pageNum = Number(page);
  const pageSizeNum = Number(pageSize);

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM (
      SELECT id FROM sessions WHERE patient_id = ?
      UNION ALL
      SELECT id FROM follow_up_records WHERE patient_id = ?
      UNION ALL
      SELECT id FROM summaries WHERE patient_id = ?
      UNION ALL
      SELECT id FROM todos WHERE patient_id = ?
    )
  `);
  const { total } = countStmt.get(patientId, patientId, patientId, patientId) as { total: number };

  const offset = (pageNum - 1) * pageSizeNum;

  const stmt = db.prepare(`
    SELECT * FROM (
      SELECT id, 'session' as type, title as content, created_at, status, NULL as subtype
      FROM sessions WHERE patient_id = ?
      UNION ALL
      SELECT id, 'record' as type, substr(content, 1, 100) as content, created_at,
        CASE WHEN is_merged = 1 AND merged_from_ids IS NOT NULL THEN 'merged' ELSE 'active' END as status,
        CASE WHEN is_merged = 1 AND merged_from_ids IS NOT NULL THEN 'merged' ELSE record_type END as subtype
      FROM follow_up_records WHERE patient_id = ?
      UNION ALL
      SELECT id, 'summary' as type, substr(content, 1, 100) as content, created_at, status, generated_by as subtype
      FROM summaries WHERE patient_id = ?
      UNION ALL
      SELECT id, 'todo' as type, title as content, created_at, status, type as subtype
      FROM todos WHERE patient_id = ?
    )
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);

  const rows = stmt.all(patientId, patientId, patientId, patientId, pageSizeNum, offset) as any[];

  const timeline = rows.map((row) => ({
    id: row.id,
    type: row.type,
    content: row.content,
    status: row.status,
    subtype: row.subtype,
    createdAt: row.created_at,
  }));

  paginated(res, timeline, total, pageNum, pageSizeNum, '查询成功');
};
