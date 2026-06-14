import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { success, notFound, paginated, badRequest } from '../utils/response';
import { FollowUpRecord } from '../types';
import { extractSymptoms, extractMedicationFeedback, detectRiskKeywords } from '../services/aiService';

const rowToRecord = (row: any): FollowUpRecord => ({
  id: row.id,
  sessionId: row.session_id,
  patientId: row.patient_id,
  doctorId: row.doctor_id,
  content: row.content,
  recordType: row.record_type,
  symptoms: row.symptoms,
  medicationFeedback: row.medication_feedback,
  isMerged: row.is_merged,
  mergedFromIds: row.merged_from_ids,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getRecords = (req: Request, res: Response): void => {
  const { sessionId, patientId, recordType, isMerged, page = 1, pageSize = 10 } = req.query;

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
  if (recordType) {
    whereClause += ' AND record_type = ?';
    params.push(recordType);
  }
  if (isMerged !== undefined) {
    whereClause += ' AND is_merged = ?';
    params.push(Number(isMerged));
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM follow_up_records ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM follow_up_records ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const records = rows.map(rowToRecord);

  paginated(res, records, total, pageNum, pageSizeNum);
};

export const getRecord = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM follow_up_records WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '记录不存在');
    return;
  }

  success(res, rowToRecord(row));
};

export const createRecord = (req: Request, res: Response): void => {
  const { sessionId, patientId, doctorId, content, recordType = 'text' } = req.body;

  if (!sessionId || !patientId || !content) {
    badRequest(res, '会话ID、患者ID和内容不能为空');
    return;
  }

  const symptoms = extractSymptoms(content).join(',');
  const { feedback } = extractMedicationFeedback(content);
  const riskKeywords = detectRiskKeywords(content);

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO follow_up_records (id, session_id, patient_id, doctor_id, content, record_type, symptoms, medication_feedback)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, sessionId, patientId, doctorId || null, content, recordType, symptoms || null, feedback || null);

  if (riskKeywords.length > 0) {
    const insertAlert = db.prepare(`
      INSERT INTO risk_alerts (id, session_id, patient_id, record_id, keyword, description, level, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    for (const risk of riskKeywords) {
      insertAlert.run(
        uuidv4(),
        sessionId,
        patientId,
        id,
        risk.keyword,
        `记录中检测到关键词"${risk.keyword}"`,
        risk.level
      );
    }
  }

  const getStmt = db.prepare('SELECT * FROM follow_up_records WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(
    res,
    {
      ...rowToRecord(row),
      detectedRisks: riskKeywords,
    },
    '创建成功'
  );
};

export const updateRecord = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { content, recordType, symptoms, medicationFeedback } = req.body;

  const checkStmt = db.prepare('SELECT id, session_id, patient_id FROM follow_up_records WHERE id = ?');
  const exists = checkStmt.get(id) as any;
  if (!exists) {
    notFound(res, '记录不存在');
    return;
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (content !== undefined) {
    updates.push('content = ?');
    params.push(content);

    const newSymptoms = extractSymptoms(content).join(',');
    const { feedback } = extractMedicationFeedback(content);

    updates.push('symptoms = ?');
    params.push(newSymptoms || null);
    updates.push('medication_feedback = ?');
    params.push(feedback || null);
  }
  if (recordType !== undefined) {
    updates.push('record_type = ?');
    params.push(recordType);
  }
  if (symptoms !== undefined) {
    updates.push('symptoms = ?');
    params.push(symptoms);
  }
  if (medicationFeedback !== undefined) {
    updates.push('medication_feedback = ?');
    params.push(medicationFeedback);
  }

  if (updates.length === 0) {
    badRequest(res, '没有需要更新的字段');
    return;
  }

  updates.push('updated_at = datetime("now")');
  params.push(id);

  const stmt = db.prepare(`UPDATE follow_up_records SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  const getStmt = db.prepare('SELECT * FROM follow_up_records WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToRecord(row), '更新成功');
};

export const deleteRecord = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT id FROM follow_up_records WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '记录不存在');
    return;
  }

  const stmt = db.prepare('DELETE FROM follow_up_records WHERE id = ?');
  stmt.run(id);

  success(res, null, '删除成功');
};

export const mergeRecords = (req: Request, res: Response): void => {
  const { recordIds, sessionId, patientId, doctorId } = req.body;

  if (!recordIds || !Array.isArray(recordIds) || recordIds.length < 2) {
    badRequest(res, '请提供至少2条记录进行合并');
    return;
  }

  if (!sessionId || !patientId) {
    badRequest(res, '会话ID和患者ID不能为空');
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

  const mergedContent = records.map((r) => `[${r.created_at}] ${r.content}`).join('\n\n');
  const allSymptoms = records.flatMap((r) => (r.symptoms ? r.symptoms.split(',') : []));
  const uniqueSymptoms = [...new Set(allSymptoms.filter((s) => s.trim()))].join(',');
  const allMedFeedback = records
    .map((r) => r.medication_feedback)
    .filter((m) => m)
    .join('; ');

  const mergedId = uuidv4();
  const insertStmt = db.prepare(`
    INSERT INTO follow_up_records (id, session_id, patient_id, doctor_id, content, record_type, symptoms, medication_feedback, is_merged, merged_from_ids)
    VALUES (?, ?, ?, ?, ?, 'text', ?, ?, 1, ?)
  `);
  insertStmt.run(
    mergedId,
    sessionId,
    patientId,
    doctorId || null,
    mergedContent,
    uniqueSymptoms || null,
    allMedFeedback || null,
    JSON.stringify(recordIds)
  );

  const updateStmt = db.prepare(`
    UPDATE follow_up_records
    SET is_merged = 1, updated_at = datetime('now')
    WHERE id IN (${placeholders})
  `);
  updateStmt.run(...recordIds);

  const resultStmt = db.prepare('SELECT * FROM follow_up_records WHERE id = ?');
  const mergedRow = resultStmt.get(mergedId) as any;

  success(
    res,
    {
      mergedRecord: rowToRecord(mergedRow),
      mergedCount: records.length,
    },
    '合并成功'
  );
};

export const extractRecordInfo = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM follow_up_records WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '记录不存在');
    return;
  }

  const symptoms = row.symptoms
    ? row.symptoms.split(',')
    : extractSymptoms(row.content);
  const { medications, feedback } = extractMedicationFeedback(row.content);
  const risks = detectRiskKeywords(row.content);

  success(res, {
    symptoms,
    medications,
    medicationFeedback: feedback || row.medication_feedback,
    risks,
  });
};
