import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { success, notFound, paginated, badRequest } from '../utils/response';
import { RiskAlert } from '../types';
import { detectRiskKeywords, getRiskKeywords } from '../services/aiService';

const rowToAlert = (row: any): RiskAlert => ({
  id: row.id,
  sessionId: row.session_id,
  patientId: row.patient_id,
  recordId: row.record_id,
  keyword: row.keyword,
  description: row.description,
  level: row.level,
  status: row.status,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getRiskAlerts = (req: Request, res: Response): void => {
  const { patientId, sessionId, recordId, level, status, page = 1, pageSize = 10 } = req.query;

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
  if (recordId) {
    whereClause += ' AND record_id = ?';
    params.push(recordId);
  }
  if (level) {
    whereClause += ' AND level = ?';
    params.push(level);
  }
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM risk_alerts ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM risk_alerts ${whereClause}
    ORDER BY
      CASE level
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
      END,
      created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const alerts = rows.map(rowToAlert);

  paginated(res, alerts, total, pageNum, pageSizeNum);
};

export const getRiskAlert = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM risk_alerts WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '风险提示不存在');
    return;
  }

  success(res, rowToAlert(row));
};

export const createRiskAlert = (req: Request, res: Response): void => {
  const { sessionId, patientId, recordId, keyword, description, level = 'medium' } = req.body;

  if (!patientId || !keyword) {
    badRequest(res, '患者ID和关键词不能为空');
    return;
  }

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO risk_alerts (id, session_id, patient_id, record_id, keyword, description, level)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    sessionId || null,
    patientId,
    recordId || null,
    keyword,
    description || null,
    level
  );

  const getStmt = db.prepare('SELECT * FROM risk_alerts WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToAlert(row), '创建成功');
};

export const reviewRiskAlert = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { reviewedBy, status = 'reviewed' } = req.body;

  const checkStmt = db.prepare('SELECT id FROM risk_alerts WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '风险提示不存在');
    return;
  }

  const stmt = db.prepare(`
    UPDATE risk_alerts
    SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(status, reviewedBy || null, id);

  const getStmt = db.prepare('SELECT * FROM risk_alerts WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToAlert(row), '审核完成');
};

export const batchReview = (req: Request, res: Response): void => {
  const { ids, reviewedBy, status = 'reviewed' } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    badRequest(res, '请提供要审核的风险提示ID列表');
    return;
  }

  const placeholders = ids.map(() => '?').join(', ');
  const stmt = db.prepare(`
    UPDATE risk_alerts
    SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE id IN (${placeholders})
  `);
  const result = stmt.run(status, reviewedBy || null, ...ids);

  success(
    res,
    {
      updatedCount: result.changes,
      status,
    },
    '批量审核完成'
  );
};

export const deleteRiskAlert = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT id FROM risk_alerts WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '风险提示不存在');
    return;
  }

  const stmt = db.prepare('DELETE FROM risk_alerts WHERE id = ?');
  stmt.run(id);

  success(res, null, '删除成功');
};

export const getRiskKeywordsList = (_req: Request, res: Response): void => {
  const keywords = getRiskKeywords();
  success(res, keywords);
};

export const detectRisksFromText = (req: Request, res: Response): void => {
  const { content } = req.body;

  if (!content) {
    badRequest(res, '内容不能为空');
    return;
  }

  const detected = detectRiskKeywords(content);

  success(res, {
    content,
    detectedRisks: detected,
    riskCount: detected.length,
    hasHighRisk: detected.some((r) => r.level === 'high'),
  });
};
