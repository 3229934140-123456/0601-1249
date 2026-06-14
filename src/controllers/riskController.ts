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

export const getRiskDashboard = (req: Request, res: Response): void => {
  const { patientId, sessionId, doctorId } = req.query;

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

  const totalStmt = db.prepare(`SELECT COUNT(*) as count FROM risk_alerts ${whereClause}`);
  const total = (totalStmt.get(...params) as { count: number }).count;

  const pendingStmt = db.prepare(`SELECT COUNT(*) as count FROM risk_alerts ${whereClause} AND status = 'pending'`);
  const pendingCount = (pendingStmt.get(...params) as { count: number }).count;

  const reviewedStmt = db.prepare(`SELECT COUNT(*) as count FROM risk_alerts ${whereClause} AND status = 'reviewed'`);
  const reviewedCount = (reviewedStmt.get(...params) as { count: number }).count;

  const ignoredStmt = db.prepare(`SELECT COUNT(*) as count FROM risk_alerts ${whereClause} AND status = 'ignored'`);
  const ignoredCount = (ignoredStmt.get(...params) as { count: number }).count;

  const byLevelStmt = db.prepare(`
    SELECT level, COUNT(*) as count FROM risk_alerts ${whereClause}
    GROUP BY level ORDER BY CASE level WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END
  `);
  const byLevel = byLevelStmt.all(...params) as { level: string; count: number }[];

  const pendingByLevelStmt = db.prepare(`
    SELECT level, COUNT(*) as count FROM risk_alerts ${whereClause} AND status = 'pending'
    GROUP BY level ORDER BY CASE level WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END
  `);
  const pendingByLevel = pendingByLevelStmt.all(...params) as { level: string; count: number }[];

  const byPatientStmt = db.prepare(`
    SELECT patient_id, COUNT(*) as count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN level = 'high' AND status = 'pending' THEN 1 ELSE 0 END) as high_pending_count
    FROM risk_alerts
    ${whereClause}
    GROUP BY patient_id
    ORDER BY high_pending_count DESC, pending_count DESC
    LIMIT 20
  `);
  const byPatient = byPatientStmt.all(...params) as any[];

  const bySessionStmt = db.prepare(`
    SELECT session_id, COUNT(*) as count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
    FROM risk_alerts
    ${whereClause}
    GROUP BY session_id
    ORDER BY pending_count DESC
    LIMIT 20
  `);
  const bySession = bySessionStmt.all(...params) as any[];

  success(res, {
    total,
    pendingCount,
    reviewedCount,
    ignoredCount,
    byLevel,
    pendingByLevel,
    byPatient,
    bySession,
  });
};

export const batchOperation = (req: Request, res: Response): void => {
  const { ids, operation, operatedBy } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    badRequest(res, '请提供要操作的风险提示ID列表');
    return;
  }

  if (!operation) {
    badRequest(res, '操作类型不能为空');
    return;
  }

  if (!operatedBy) {
    badRequest(res, '操作人不能为空');
    return;
  }

  const validOperations = ['review', 'ignore', 'reopen'];
  if (!validOperations.includes(operation)) {
    badRequest(res, `操作类型只支持 ${validOperations.join('、')}`);
    return;
  }

  const uniqueIds = [...new Set(ids)];

  const results: {
    id: string;
    success: boolean;
    code: string;
    message: string;
    alert?: RiskAlert;
  }[] = [];

  const getStmt = db.prepare('SELECT * FROM risk_alerts WHERE id = ?');

  for (const alertId of uniqueIds) {
    const existing = getStmt.get(alertId) as any;
    if (!existing) {
      results.push({ id: alertId, success: false, code: 'NOT_FOUND', message: '未找到' });
      continue;
    }

    if (operation === 'review') {
      if (existing.status === 'reviewed') {
        results.push({ id: alertId, success: false, code: 'ALREADY_REVIEWED', message: '已处于已确认状态' });
        continue;
      }
      const updateStmt = db.prepare(`
        UPDATE risk_alerts
        SET status = 'reviewed', reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(operatedBy, alertId);
      const updated = getStmt.get(alertId) as any;
      results.push({ id: alertId, success: true, code: 'OK', message: '已确认', alert: rowToAlert(updated) });
    } else if (operation === 'ignore') {
      if (existing.status === 'ignored') {
        results.push({ id: alertId, success: false, code: 'ALREADY_IGNORED', message: '已处于已忽略状态' });
        continue;
      }
      const updateStmt = db.prepare(`
        UPDATE risk_alerts
        SET status = 'ignored', reviewed_by = ?, reviewed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(operatedBy, alertId);
      const updated = getStmt.get(alertId) as any;
      results.push({ id: alertId, success: true, code: 'OK', message: '已忽略', alert: rowToAlert(updated) });
    } else if (operation === 'reopen') {
      if (existing.status === 'pending') {
        results.push({ id: alertId, success: false, code: 'ALREADY_PENDING', message: '已处于待处理状态' });
        continue;
      }
      const updateStmt = db.prepare(`
        UPDATE risk_alerts
        SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, updated_at = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(alertId);
      const updated = getStmt.get(alertId) as any;
      results.push({ id: alertId, success: true, code: 'OK', message: '已重新打开', alert: rowToAlert(updated) });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  success(
    res,
    {
      total: ids.length,
      uniqueCount: uniqueIds.length,
      successCount,
      failedCount: uniqueIds.length - successCount,
      operation,
      results,
    },
    `批量操作完成：${successCount}条成功，${uniqueIds.length - successCount}条未处理`
  );
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
