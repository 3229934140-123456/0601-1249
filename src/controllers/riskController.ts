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

  if (!reviewedBy) {
    badRequest(res, '审核人不能为空');
    return;
  }

  const validStatuses = ['reviewed', 'ignored'];
  if (!validStatuses.includes(status)) {
    badRequest(res, `状态只支持 ${validStatuses.join(' 或 ')}`);
    return;
  }

  const checkStmt = db.prepare('SELECT id, status FROM risk_alerts WHERE id = ?');
  const existing = checkStmt.get(id) as any;
  if (!existing) {
    notFound(res, '风险提示不存在');
    return;
  }

  if (existing.status === status) {
    badRequest(res, `风险提示已处于${status === 'reviewed' ? '已审核' : '已忽略'}状态`);
    return;
  }

  const stmt = db.prepare(`
    UPDATE risk_alerts
    SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(status, reviewedBy, id);

  const getStmt = db.prepare('SELECT * FROM risk_alerts WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToAlert(row), status === 'reviewed' ? '已确认' : '已忽略');
};

export const reopenRiskAlert = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { reopenedBy } = req.body;

  if (!reopenedBy) {
    badRequest(res, '操作人不能为空');
    return;
  }

  const checkStmt = db.prepare('SELECT id, status FROM risk_alerts WHERE id = ?');
  const existing = checkStmt.get(id) as any;
  if (!existing) {
    notFound(res, '风险提示不存在');
    return;
  }

  if (existing.status === 'pending') {
    badRequest(res, '风险提示已处于待处理状态');
    return;
  }

  const stmt = db.prepare(`
    UPDATE risk_alerts
    SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(id);

  const getStmt = db.prepare('SELECT * FROM risk_alerts WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToAlert(row), '已重新打开');
};

export const batchReview = (req: Request, res: Response): void => {
  const { ids, reviewedBy, status = 'reviewed' } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    badRequest(res, '请提供要审核的风险提示ID列表');
    return;
  }

  if (!reviewedBy) {
    badRequest(res, '审核人不能为空');
    return;
  }

  const validStatuses = ['reviewed', 'ignored'];
  if (!validStatuses.includes(status)) {
    badRequest(res, `批量状态只支持 ${validStatuses.join(' 或 ')}`);
    return;
  }

  const results: { id: string; success: boolean; message: string }[] = [];
  const getStmt = db.prepare('SELECT id, status FROM risk_alerts WHERE id = ?');
  const updateStmt = db.prepare(`
    UPDATE risk_alerts
    SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `);

  for (const alertId of ids) {
    const existing = getStmt.get(alertId) as any;
    if (!existing) {
      results.push({ id: alertId, success: false, message: '未找到' });
      continue;
    }
    if (existing.status === status) {
      results.push({ id: alertId, success: false, message: `已处于${status === 'reviewed' ? '已审核' : '已忽略'}状态` });
      continue;
    }
    updateStmt.run(status, reviewedBy, alertId);
    results.push({ id: alertId, success: true, message: '处理成功' });
  }

  const successCount = results.filter((r) => r.success).length;

  success(
    res,
    {
      total: ids.length,
      successCount,
      failedCount: ids.length - successCount,
      status,
      results,
    },
    `批量处理完成：${successCount}条成功，${ids.length - successCount}条未处理`
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
