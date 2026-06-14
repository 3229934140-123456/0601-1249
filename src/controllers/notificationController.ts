import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { success, notFound, paginated, badRequest } from '../utils/response';
import { Notification, MessageTemplate } from '../types';

const rowToNotification = (row: any): Notification => ({
  id: row.id,
  patientId: row.patient_id,
  doctorId: row.doctor_id,
  familyMemberId: row.family_member_id,
  type: row.type,
  templateId: row.template_id,
  title: row.title,
  content: row.content,
  channel: row.channel,
  status: row.status,
  sentAt: row.sent_at,
  createdAt: row.created_at,
});

const rowToTemplate = (row: any): MessageTemplate => ({
  id: row.id,
  name: row.name,
  type: row.type,
  title: row.title,
  content: row.content,
  channel: row.channel,
  isDefault: row.is_default,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getNotifications = (req: Request, res: Response): void => {
  const { patientId, doctorId, familyMemberId, type, channel, status, page = 1, pageSize = 10 } = req.query;

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
  if (familyMemberId) {
    whereClause += ' AND family_member_id = ?';
    params.push(familyMemberId);
  }
  if (type) {
    whereClause += ' AND type = ?';
    params.push(type);
  }
  if (channel) {
    whereClause += ' AND channel = ?';
    params.push(channel);
  }
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM notifications ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM notifications ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const notifications = rows.map(rowToNotification);

  paginated(res, notifications, total, pageNum, pageSizeNum);
};

export const getNotification = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '通知不存在');
    return;
  }

  success(res, rowToNotification(row));
};

export const createNotification = (req: Request, res: Response): void => {
  const {
    patientId,
    doctorId,
    familyMemberId,
    type = 'info',
    templateId,
    title,
    content,
    channel = 'app',
  } = req.body;

  if (!title || !content) {
    badRequest(res, '标题和内容不能为空');
    return;
  }

  let finalTitle = title;
  let finalContent = content;

  if (templateId) {
    const templateStmt = db.prepare('SELECT * FROM message_templates WHERE id = ?');
    const template = templateStmt.get(templateId) as any;
    if (template) {
      finalTitle = template.title;
      finalContent = template.content;
    }
  }

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO notifications (id, patient_id, doctor_id, family_member_id, type, template_id, title, content, channel)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    patientId || null,
    doctorId || null,
    familyMemberId || null,
    type,
    templateId || null,
    finalTitle,
    finalContent,
    channel
  );

  const getStmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToNotification(row), '创建成功');
};

export const sendNotification = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
  const row = checkStmt.get(id) as any;
  if (!row) {
    notFound(res, '通知不存在');
    return;
  }

  const stmt = db.prepare(`
    UPDATE notifications
    SET status = 'sent', sent_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(id);

  const getStmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
  const updatedRow = getStmt.get(id) as any;

  success(res, rowToNotification(updatedRow), '发送成功');
};

export const deleteNotification = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT id FROM notifications WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '通知不存在');
    return;
  }

  const stmt = db.prepare('DELETE FROM notifications WHERE id = ?');
  stmt.run(id);

  success(res, null, '删除成功');
};

export const getTemplates = (req: Request, res: Response): void => {
  const { type, channel, isDefault, page = 1, pageSize = 20 } = req.query;

  const pageNum = Number(page);
  const pageSizeNum = Number(pageSize);
  const offset = (pageNum - 1) * pageSizeNum;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (type) {
    whereClause += ' AND type = ?';
    params.push(type);
  }
  if (channel) {
    whereClause += ' AND channel = ?';
    params.push(channel);
  }
  if (isDefault !== undefined) {
    whereClause += ' AND is_default = ?';
    params.push(Number(isDefault));
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM message_templates ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM message_templates ${whereClause}
    ORDER BY is_default DESC, created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const templates = rows.map(rowToTemplate);

  paginated(res, templates, total, pageNum, pageSizeNum);
};

export const getTemplate = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM message_templates WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '模板不存在');
    return;
  }

  success(res, rowToTemplate(row));
};

export const createTemplate = (req: Request, res: Response): void => {
  const { name, type, title, content, channel = 'app', isDefault = 0 } = req.body;

  if (!name || !title || !content) {
    badRequest(res, '名称、标题和内容不能为空');
    return;
  }

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO message_templates (id, name, type, title, content, channel, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, name, type, title, content, channel, Number(isDefault));

  const getStmt = db.prepare('SELECT * FROM message_templates WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToTemplate(row), '创建成功');
};

export const updateTemplate = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { name, type, title, content, channel, isDefault } = req.body;

  const checkStmt = db.prepare('SELECT id FROM message_templates WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '模板不存在');
    return;
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (type !== undefined) {
    updates.push('type = ?');
    params.push(type);
  }
  if (title !== undefined) {
    updates.push('title = ?');
    params.push(title);
  }
  if (content !== undefined) {
    updates.push('content = ?');
    params.push(content);
  }
  if (channel !== undefined) {
    updates.push('channel = ?');
    params.push(channel);
  }
  if (isDefault !== undefined) {
    updates.push('is_default = ?');
    params.push(Number(isDefault));
  }

  if (updates.length === 0) {
    badRequest(res, '没有需要更新的字段');
    return;
  }

  updates.push('updated_at = datetime("now")');
  params.push(id);

  const stmt = db.prepare(`UPDATE message_templates SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  const getStmt = db.prepare('SELECT * FROM message_templates WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToTemplate(row), '更新成功');
};

export const deleteTemplate = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT id FROM message_templates WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '模板不存在');
    return;
  }

  const stmt = db.prepare('DELETE FROM message_templates WHERE id = ?');
  stmt.run(id);

  success(res, null, '删除成功');
};

export const createFamilyReminder = (req: Request, res: Response): void => {
  const { patientId, familyMemberId, templateId, customContent, channel = 'app' } = req.body;

  if (!patientId) {
    badRequest(res, '患者ID不能为空');
    return;
  }

  let title = '家属关怀提醒';
  let content = customContent || '您的家人近期随访情况良好，请放心。';

  if (templateId) {
    const templateStmt = db.prepare('SELECT * FROM message_templates WHERE id = ?');
    const template = templateStmt.get(templateId) as any;
    if (template) {
      title = template.title;
      content = template.content;
    }
  }

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO notifications (id, patient_id, family_member_id, type, template_id, title, content, channel)
    VALUES (?, ?, ?, 'reminder', ?, ?, ?, ?)
  `);
  stmt.run(id, patientId, familyMemberId || null, templateId || null, title, content, channel);

  const getStmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToNotification(row), '家属提醒创建成功');
};
