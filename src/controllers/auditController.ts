import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { success, notFound, paginated, badRequest } from '../utils/response';
import { AuditLog, RetractedContent, DoctorNote } from '../types';

const rowToAuditLog = (row: any): AuditLog => ({
  id: row.id,
  userId: row.user_id,
  action: row.action,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  requestParams: row.request_params,
  responseData: row.response_data,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  status: row.status,
  errorMessage: row.error_message,
  createdAt: row.created_at,
});

const rowToRetractedContent = (row: any): RetractedContent => ({
  id: row.id,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  originalContent: row.original_content,
  reason: row.reason,
  retractedBy: row.retracted_by,
  createdAt: row.created_at,
});

const rowToDoctorNote = (row: any): DoctorNote => ({
  id: row.id,
  sessionId: row.session_id,
  patientId: row.patient_id,
  doctorId: row.doctor_id,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getAuditLogs = (req: Request, res: Response): void => {
  const {
    userId,
    action,
    resourceType,
    resourceId,
    status,
    startDate,
    endDate,
    page = 1,
    pageSize = 20,
  } = req.query;

  const pageNum = Number(page);
  const pageSizeNum = Number(pageSize);
  const offset = (pageNum - 1) * pageSizeNum;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (userId) {
    whereClause += ' AND user_id = ?';
    params.push(userId);
  }
  if (action) {
    whereClause += ' AND action = ?';
    params.push(action);
  }
  if (resourceType) {
    whereClause += ' AND resource_type = ?';
    params.push(resourceType);
  }
  if (resourceId) {
    whereClause += ' AND resource_id = ?';
    params.push(resourceId);
  }
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  if (startDate) {
    whereClause += ' AND created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    whereClause += ' AND created_at <= ?';
    params.push(endDate);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM audit_logs ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const logs = rows.map(rowToAuditLog);

  paginated(res, logs, total, pageNum, pageSizeNum);
};

export const getAuditLog = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM audit_logs WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '审计记录不存在');
    return;
  }

  success(res, rowToAuditLog(row));
};

export const getRetractedContents = (req: Request, res: Response): void => {
  const { resourceType, retractedBy, page = 1, pageSize = 10 } = req.query;

  const pageNum = Number(page);
  const pageSizeNum = Number(pageSize);
  const offset = (pageNum - 1) * pageSizeNum;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (resourceType) {
    whereClause += ' AND resource_type = ?';
    params.push(resourceType);
  }
  if (retractedBy) {
    whereClause += ' AND retracted_by = ?';
    params.push(retractedBy);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM retracted_contents ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM retracted_contents ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const contents = rows.map(rowToRetractedContent);

  paginated(res, contents, total, pageNum, pageSizeNum);
};

export const retractContent = (req: Request, res: Response): void => {
  const { resourceType, resourceId, reason, retractedBy } = req.body;

  if (!resourceType || !resourceId || !retractedBy) {
    badRequest(res, '资源类型、资源ID和撤回人不能为空');
    return;
  }

  let originalContent = '';
  let tableName = '';
  let idColumn = 'id';

  switch (resourceType) {
    case 'summary':
      tableName = 'summaries';
      break;
    case 'record':
      tableName = 'follow_up_records';
      break;
    case 'session':
      tableName = 'sessions';
      break;
    case 'todo':
      tableName = 'todos';
      break;
    case 'risk_alert':
      tableName = 'risk_alerts';
      break;
    default:
      badRequest(res, '不支持的资源类型');
      return;
  }

  const getStmt = db.prepare(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`);
  const resource = getStmt.get(resourceId) as any;

  if (!resource) {
    notFound(res, '资源不存在');
    return;
  }

  originalContent = JSON.stringify(resource);

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO retracted_contents (id, resource_type, resource_id, original_content, reason, retracted_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, resourceType, resourceId, originalContent, reason || null, retractedBy);

  const deleteStmt = db.prepare(`DELETE FROM ${tableName} WHERE ${idColumn} = ?`);
  deleteStmt.run(resourceId);

  const resultStmt = db.prepare('SELECT * FROM retracted_contents WHERE id = ?');
  const row = resultStmt.get(id) as any;

  success(res, rowToRetractedContent(row), '撤回成功');
};

export const restoreContent = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM retracted_contents WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '撤回记录不存在');
    return;
  }

  let tableName = '';

  switch (row.resource_type) {
    case 'summary':
      tableName = 'summaries';
      break;
    case 'record':
      tableName = 'follow_up_records';
      break;
    case 'session':
      tableName = 'sessions';
      break;
    case 'todo':
      tableName = 'todos';
      break;
    case 'risk_alert':
      tableName = 'risk_alerts';
      break;
    default:
      badRequest(res, '不支持的资源类型');
      return;
  }

  let originalData: any;
  try {
    originalData = JSON.parse(row.original_content);
  } catch (e) {
    badRequest(res, '原始内容格式错误');
    return;
  }

  const columns = Object.keys(originalData).map((key) => {
    return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  });
  const placeholders = Object.keys(originalData).map(() => '?').join(', ');
  const values = Object.values(originalData);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO ${tableName} (${Object.keys(originalData).join(', ')})
    VALUES (${placeholders})
  `);
  insertStmt.run(...values);

  const deleteStmt = db.prepare('DELETE FROM retracted_contents WHERE id = ?');
  deleteStmt.run(id);

  success(res, { restored: true, resourceType: row.resource_type, resourceId: row.resource_id }, '恢复成功');
};

export const getDoctorNotes = (req: Request, res: Response): void => {
  const { sessionId, patientId, doctorId, page = 1, pageSize = 10 } = req.query;

  const pageNum = Number(page);
  const pageSizeNum = Number(pageSize);
  const offset = (pageNum - 1) * pageSizeNum;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (sessionId) {
    whereClause += ' AND session_id = ?';
    params.push(sessionId);
  }
  if (patientId) {
    whereClause += ' AND patient_id = ?';
    params.push(patientId);
  }
  if (doctorId) {
    whereClause += ' AND doctor_id = ?';
    params.push(doctorId);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM doctor_notes ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM doctor_notes ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const notes = rows.map(rowToDoctorNote);

  paginated(res, notes, total, pageNum, pageSizeNum);
};

export const getDoctorNote = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM doctor_notes WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '医生批注不存在');
    return;
  }

  success(res, rowToDoctorNote(row));
};

export const createDoctorNote = (req: Request, res: Response): void => {
  const { sessionId, patientId, doctorId, content } = req.body;

  if (!sessionId || !patientId || !doctorId || !content) {
    badRequest(res, '会话ID、患者ID、医生ID和内容不能为空');
    return;
  }

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO doctor_notes (id, session_id, patient_id, doctor_id, content)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, sessionId, patientId, doctorId, content);

  const getStmt = db.prepare('SELECT * FROM doctor_notes WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToDoctorNote(row), '创建成功');
};

export const updateDoctorNote = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { content } = req.body;

  const checkStmt = db.prepare('SELECT id FROM doctor_notes WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '医生批注不存在');
    return;
  }

  if (content === undefined) {
    badRequest(res, '内容不能为空');
    return;
  }

  const stmt = db.prepare(`
    UPDATE doctor_notes
    SET content = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(content, id);

  const getStmt = db.prepare('SELECT * FROM doctor_notes WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToDoctorNote(row), '更新成功');
};

export const deleteDoctorNote = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT id FROM doctor_notes WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '医生批注不存在');
    return;
  }

  const stmt = db.prepare('DELETE FROM doctor_notes WHERE id = ?');
  stmt.run(id);

  success(res, null, '删除成功');
};
