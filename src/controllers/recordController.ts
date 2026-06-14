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

  const record = rowToRecord(row) as any;

  if (record.isMerged === 1 && record.mergedFromIds) {
    try {
      const sourceIds = JSON.parse(record.mergedFromIds);
      const sources = db.prepare(`
        SELECT id, created_at, substr(content, 1, 80) as content_preview, is_merged
        FROM follow_up_records WHERE id IN (${sourceIds.map(() => '?').join(', ')})
        ORDER BY created_at ASC
      `).all(...sourceIds) as any[];

      record.mergeInfo = {
        isMergeResult: true,
        sourceCount: sourceIds.length,
        sourceIds,
        sourceRecords: sources.map((s: any) => ({
          id: s.id,
          createdAt: s.created_at,
          contentPreview: s.content_preview,
          isMerged: s.is_merged === 1,
        })),
        mergeSummary: `本记录由 ${sourceIds.length} 条随访记录合并生成，点击来源记录可查看详情。`,
      };
    } catch (e) {
      record.mergeInfo = {
        isMergeResult: true,
        sourceCount: 0,
        sourceIds: [],
        mergeSummary: '合并来源信息解析失败',
      };
    }
  } else if (record.isMerged === 1) {
    const mergedInto = db.prepare(`
      SELECT id, created_at, substr(content, 1, 80) as content_preview
      FROM follow_up_records
      WHERE merged_from_ids LIKE ?
      LIMIT 1
    `).get(`%"${id}"%`) as any;

    if (mergedInto) {
      record.mergeInfo = {
        isSourceRecord: true,
        mergedIntoId: mergedInto.id,
        mergedIntoCreatedAt: mergedInto.created_at,
        mergedIntoContentPreview: mergedInto.content_preview,
      };
    }
  }

  success(res, record);
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

  const uniqueIds = [...new Set(recordIds)];
  const duplicates = recordIds.length !== uniqueIds.length;
  const duplicateIds = duplicates
    ? recordIds.filter((id: string, idx: number) => recordIds.indexOf(id) !== idx)
    : [];

  if (duplicates) {
    success(
      res,
      {
        success: false,
        code: 'DUPLICATE_IDS',
        message: '提交了重复的记录ID',
        errors: [
          {
            type: 'duplicate',
            recordIds: duplicateIds,
            message: `存在 ${duplicateIds.length} 个重复的记录ID：${duplicateIds.join(', ')}`,
          },
        ],
        submittedIds: recordIds,
        uniqueCount: uniqueIds.length,
        submittedCount: recordIds.length,
      },
      '合并失败'
    );
    return;
  }

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const getStmt = db.prepare(`
    SELECT * FROM follow_up_records
    WHERE id IN (${placeholders})
    ORDER BY created_at ASC
  `);
  const records = getStmt.all(...uniqueIds) as any[];

  const errors: any[] = [];

  if (records.length !== uniqueIds.length) {
    const foundIds = new Set(records.map((r) => r.id));
    const missingIds = uniqueIds.filter((id: string) => !foundIds.has(id));
    errors.push({
      type: 'not_found',
      recordIds: missingIds,
      message: `以下 ${missingIds.length} 个记录ID不存在：${missingIds.join(', ')}`,
    });
  }

  const wrongPatient = records.filter((r) => r.patient_id !== patientId);
  if (wrongPatient.length > 0) {
    errors.push({
      type: 'wrong_patient',
      recordIds: wrongPatient.map((r) => r.id),
      message: `以下 ${wrongPatient.length} 条记录不属于该患者：${wrongPatient.map((r) => r.id).join(', ')}`,
      expectedPatientId: patientId,
    });
  }

  const wrongSession = records.filter((r) => r.session_id !== sessionId);
  if (wrongSession.length > 0) {
    errors.push({
      type: 'wrong_session',
      recordIds: wrongSession.map((r) => r.id),
      message: `以下 ${wrongSession.length} 条记录不属于该会话：${wrongSession.map((r) => r.id).join(', ')}`,
      expectedSessionId: sessionId,
    });
  }

  if (errors.length > 0) {
    success(
      res,
      {
        success: false,
        code: 'VALIDATION_FAILED',
        message: '记录校验失败，请检查错误明细',
        errors,
        submittedIds: uniqueIds,
        validCount: records.length - wrongPatient.length - wrongSession.length,
        totalSubmitted: uniqueIds.length,
      },
      '合并失败'
    );
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
    doctorId || records[0].doctor_id || null,
    mergedContent,
    uniqueSymptoms || null,
    allMedFeedback || null,
    JSON.stringify(uniqueIds)
  );

  const updateStmt = db.prepare(`
    UPDATE follow_up_records
    SET is_merged = 1, updated_at = datetime('now')
    WHERE id IN (${placeholders})
  `);
  updateStmt.run(...uniqueIds);

  const resultStmt = db.prepare('SELECT * FROM follow_up_records WHERE id = ?');
  const mergedRow = resultStmt.get(mergedId) as any;

  success(
    res,
    {
      success: true,
      mergedRecord: rowToRecord(mergedRow),
      mergedCount: records.length,
      sourceRecordIds: uniqueIds,
      mergeSummary: `成功合并 ${records.length} 条随访记录`,
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
