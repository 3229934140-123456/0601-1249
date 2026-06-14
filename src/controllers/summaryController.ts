import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { success, notFound, paginated, badRequest } from '../utils/response';
import { Summary } from '../types';
import { generateSummary, hideSensitiveContent } from '../services/aiService';

const rowToSummary = (row: any): Summary => ({
  id: row.id,
  sessionId: row.session_id,
  patientId: row.patient_id,
  recordIds: row.record_ids,
  content: row.content,
  symptoms: row.symptoms,
  medicationFeedback: row.medication_feedback,
  keyPoints: row.key_points,
  generatedBy: row.generated_by,
  status: row.status,
  confirmedBy: row.confirmed_by,
  confirmedAt: row.confirmed_at,
  isSensitiveHidden: row.is_sensitive_hidden,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getSummaries = (req: Request, res: Response): void => {
  const { sessionId, patientId, status, generatedBy, page = 1, pageSize = 10 } = req.query;

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
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  if (generatedBy) {
    whereClause += ' AND generated_by = ?';
    params.push(generatedBy);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM summaries ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM summaries ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const summaries = rows.map(rowToSummary);

  paginated(res, summaries, total, pageNum, pageSizeNum);
};

export const getSummary = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { hideSensitive = 'false' } = req.query;

  const stmt = db.prepare('SELECT * FROM summaries WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '摘要不存在');
    return;
  }

  const summary = rowToSummary(row);

  if (hideSensitive === 'true' || summary.isSensitiveHidden === 1) {
    summary.content = hideSensitiveContent(summary.content);
    summary.symptoms = summary.symptoms || '';
    summary.medicationFeedback = summary.medicationFeedback || '';
    summary.keyPoints = summary.keyPoints || '';
  }

  success(res, summary);
};

export const createSummary = (req: Request, res: Response): void => {
  const { sessionId, patientId, recordIds, content, symptoms, medicationFeedback, keyPoints, generatedBy = 'ai' } = req.body;

  if (!sessionId || !patientId || !recordIds) {
    badRequest(res, '会话ID、患者ID和记录ID不能为空');
    return;
  }

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO summaries (id, session_id, patient_id, record_ids, content, symptoms, medication_feedback, key_points, generated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    sessionId,
    patientId,
    Array.isArray(recordIds) ? JSON.stringify(recordIds) : recordIds,
    content || '',
    symptoms || null,
    medicationFeedback || null,
    keyPoints || null,
    generatedBy
  );

  const getStmt = db.prepare('SELECT * FROM summaries WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToSummary(row), '创建成功');
};

export const generateSummaryFromRecords = (req: Request, res: Response): void => {
  const { sessionId, patientId, recordIds } = req.body;

  if (!sessionId || !patientId || !recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
    badRequest(res, '会话ID、患者ID和记录ID列表不能为空');
    return;
  }

  const placeholders = recordIds.map(() => '?').join(', ');
  const getStmt = db.prepare(`
    SELECT * FROM follow_up_records
    WHERE id IN (${placeholders}) AND patient_id = ?
    ORDER BY created_at ASC
  `);
  const records = getStmt.all(...recordIds, patientId) as any[];

  if (records.length === 0) {
    notFound(res, '未找到符合条件的记录');
    return;
  }

  const recordData = records.map((r) => ({
    content: r.content,
    symptoms: r.symptoms,
    medicationFeedback: r.medication_feedback,
  }));

  const generated = generateSummary(recordData);

  const id = uuidv4();
  const insertStmt = db.prepare(`
    INSERT INTO summaries (id, session_id, patient_id, record_ids, content, symptoms, medication_feedback, key_points, generated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ai')
  `);
  insertStmt.run(
    id,
    sessionId,
    patientId,
    JSON.stringify(recordIds),
    generated.content,
    generated.symptoms,
    generated.medicationFeedback,
    generated.keyPoints
  );

  const getResultStmt = db.prepare('SELECT * FROM summaries WHERE id = ?');
  const row = getResultStmt.get(id) as any;

  success(res, rowToSummary(row), '摘要生成成功');
};

export const updateSummary = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { content, symptoms, medicationFeedback, keyPoints, status } = req.body;

  const checkStmt = db.prepare('SELECT id FROM summaries WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '摘要不存在');
    return;
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (content !== undefined) {
    updates.push('content = ?');
    params.push(content);
  }
  if (symptoms !== undefined) {
    updates.push('symptoms = ?');
    params.push(symptoms);
  }
  if (medicationFeedback !== undefined) {
    updates.push('medication_feedback = ?');
    params.push(medicationFeedback);
  }
  if (keyPoints !== undefined) {
    updates.push('key_points = ?');
    params.push(keyPoints);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }

  if (updates.length === 0) {
    badRequest(res, '没有需要更新的字段');
    return;
  }

  updates.push('updated_at = datetime("now")');
  params.push(id);

  const stmt = db.prepare(`UPDATE summaries SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  const getStmt = db.prepare('SELECT * FROM summaries WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToSummary(row), '更新成功');
};

export const confirmSummary = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { confirmedBy, status = 'confirmed' } = req.body;

  const checkStmt = db.prepare('SELECT id FROM summaries WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '摘要不存在');
    return;
  }

  const stmt = db.prepare(`
    UPDATE summaries
    SET status = ?, confirmed_by = ?, confirmed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(status, confirmedBy || null, id);

  const getStmt = db.prepare('SELECT * FROM summaries WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToSummary(row), '确认成功');
};

export const deleteSummary = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT id FROM summaries WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '摘要不存在');
    return;
  }

  const stmt = db.prepare('DELETE FROM summaries WHERE id = ?');
  stmt.run(id);

  success(res, null, '删除成功');
};

export const exportSummary = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { format = 'text', hideSensitive = 'false' } = req.query;

  const stmt = db.prepare(`
    SELECT s.*, p.name as patient_name
    FROM summaries s
    LEFT JOIN patients p ON s.patient_id = p.id
    WHERE s.id = ?
  `);
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '摘要不存在');
    return;
  }

  const summary = rowToSummary(row);
  const patientName = row.patient_name || '未知患者';

  let content = summary.content;
  let symptoms = summary.symptoms || '';
  let medicationFeedback = summary.medicationFeedback || '';
  let keyPoints = summary.keyPoints ? JSON.parse(summary.keyPoints) : [];

  if (hideSensitive === 'true' || summary.isSensitiveHidden === 1) {
    content = hideSensitiveContent(content);
  }

  if (format === 'json') {
    success(res, {
      patientName: hideSensitive === 'true' ? '***' : patientName,
      summary,
      symptoms: symptoms ? symptoms.split(',') : [],
      keyPoints,
      medicationFeedback,
      exportedAt: new Date().toISOString(),
    });
    return;
  }

  let textContent = '';
  textContent += `随访摘要\n`;
  textContent += `${'='.repeat(40)}\n\n`;
  textContent += `患者：${hideSensitive === 'true' ? '***' : patientName}\n`;
  textContent += `生成时间：${summary.createdAt}\n`;
  textContent += `生成方式：${summary.generatedBy === 'ai' ? 'AI生成' : '人工编写'}\n\n`;
  textContent += `${'-'.repeat(40)}\n`;
  textContent += `摘要内容：\n${content}\n\n`;

  if (symptoms) {
    textContent += `${'-'.repeat(40)}\n`;
    textContent += `主要症状：${symptoms}\n\n`;
  }

  if (medicationFeedback) {
    textContent += `${'-'.repeat(40)}\n`;
    textContent += `用药反馈：${medicationFeedback}\n\n`;
  }

  if (keyPoints.length > 0) {
    textContent += `${'-'.repeat(40)}\n`;
    textContent += `要点：\n`;
    keyPoints.forEach((point: string, index: number) => {
      textContent += `${index + 1}. ${point}\n`;
    });
    textContent += '\n';
  }

  textContent += `${'='.repeat(40)}\n`;
  textContent += `备注：本摘要由AI辅助生成，仅供参考，不做诊断结论。\n`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="summary-${id}.txt"`);
  res.send(textContent);
};

export const hideSensitiveInSummary = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT * FROM summaries WHERE id = ?');
  const row = checkStmt.get(id) as any;
  if (!row) {
    notFound(res, '摘要不存在');
    return;
  }

  const hiddenContent = hideSensitiveContent(row.content);

  const updateStmt = db.prepare(`
    UPDATE summaries
    SET content = ?, is_sensitive_hidden = 1, updated_at = datetime('now')
    WHERE id = ?
  `);
  updateStmt.run(hiddenContent, id);

  const getStmt = db.prepare('SELECT * FROM summaries WHERE id = ?');
  const updatedRow = getStmt.get(id) as any;

  success(res, rowToSummary(updatedRow), '敏感内容已隐藏');
};
