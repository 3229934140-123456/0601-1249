import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { success, notFound, paginated, badRequest } from '../utils/response';
import { Questionnaire, QuestionnaireRecommendation } from '../types';
import { recommendQuestionnaires, detectRiskKeywords } from '../services/aiService';

const rowToQuestionnaire = (row: any): Questionnaire => ({
  id: row.id,
  title: row.title,
  description: row.description,
  type: row.type,
  questions: row.questions,
  recommendedFor: row.recommended_for,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const rowToRecommendation = (row: any): QuestionnaireRecommendation => ({
  id: row.id,
  questionnaireId: row.questionnaire_id,
  patientId: row.patient_id,
  sessionId: row.session_id,
  reason: row.reason,
  status: row.status,
  createdAt: row.created_at,
});

export const getQuestionnaires = (req: Request, res: Response): void => {
  const { type, recommendedFor, page = 1, pageSize = 10 } = req.query;

  const pageNum = Number(page);
  const pageSizeNum = Number(pageSize);
  const offset = (pageNum - 1) * pageSizeNum;

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (type) {
    whereClause += ' AND type = ?';
    params.push(type);
  }
  if (recommendedFor) {
    whereClause += ' AND recommended_for LIKE ?';
    params.push(`%${recommendedFor}%`);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM questionnaires ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM questionnaires ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const questionnaires = rows.map(rowToQuestionnaire);

  paginated(res, questionnaires, total, pageNum, pageSizeNum);
};

export const getQuestionnaire = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM questionnaires WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '问卷不存在');
    return;
  }

  const result = rowToQuestionnaire(row);
  try {
    (result as any).questions = JSON.parse(result.questions);
  } catch (e) {
    // 保持原样
  }

  success(res, result);
};

export const createQuestionnaire = (req: Request, res: Response): void => {
  const { title, description, type = 'general', questions, recommendedFor } = req.body;

  if (!title || !questions) {
    badRequest(res, '标题和问题不能为空');
    return;
  }

  const questionsStr = typeof questions === 'string' ? questions : JSON.stringify(questions);

  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO questionnaires (id, title, description, type, questions, recommended_for)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, title, description || null, type, questionsStr, recommendedFor || null);

  const getStmt = db.prepare('SELECT * FROM questionnaires WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToQuestionnaire(row), '创建成功');
};

export const updateQuestionnaire = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { title, description, type, questions, recommendedFor } = req.body;

  const checkStmt = db.prepare('SELECT id FROM questionnaires WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '问卷不存在');
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
  if (questions !== undefined) {
    updates.push('questions = ?');
    params.push(typeof questions === 'string' ? questions : JSON.stringify(questions));
  }
  if (recommendedFor !== undefined) {
    updates.push('recommended_for = ?');
    params.push(recommendedFor);
  }

  if (updates.length === 0) {
    badRequest(res, '没有需要更新的字段');
    return;
  }

  updates.push('updated_at = datetime("now")');
  params.push(id);

  const stmt = db.prepare(`UPDATE questionnaires SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  const getStmt = db.prepare('SELECT * FROM questionnaires WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToQuestionnaire(row), '更新成功');
};

export const deleteQuestionnaire = (req: Request, res: Response): void => {
  const { id } = req.params;

  const checkStmt = db.prepare('SELECT id FROM questionnaires WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '问卷不存在');
    return;
  }

  const stmt = db.prepare('DELETE FROM questionnaires WHERE id = ?');
  stmt.run(id);

  success(res, null, '删除成功');
};

export const getRecommendations = (req: Request, res: Response): void => {
  const { patientId, sessionId, status, page = 1, pageSize = 10 } = req.query;

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
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM questionnaire_recommendations ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT qr.*, q.title as questionnaire_title, q.type as questionnaire_type
    FROM questionnaire_recommendations qr
    LEFT JOIN questionnaires q ON qr.questionnaire_id = q.id
    ${whereClause}
    ORDER BY qr.created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const recommendations = rows.map((row) => ({
    ...rowToRecommendation(row),
    questionnaireTitle: row.questionnaire_title,
    questionnaireType: row.questionnaire_type,
  }));

  paginated(res, recommendations, total, pageNum, pageSizeNum);
};

export const recommendForPatient = (req: Request, res: Response): void => {
  const { patientId, sessionId, symptoms, recordTypes, riskLevel, summaryId } = req.body;

  if (!patientId) {
    badRequest(res, '患者ID不能为空');
    return;
  }

  const symptomList = Array.isArray(symptoms) ? symptoms : symptoms ? [symptoms] : [];
  const typeList = Array.isArray(recordTypes) ? recordTypes : [];

  let resolvedRiskLevel = riskLevel as 'low' | 'medium' | 'high' | undefined;
  let summaryContent: string | undefined;

  if (summaryId) {
    const summaryRow = db.prepare('SELECT content, symptoms FROM summaries WHERE id = ? AND patient_id = ?').get(summaryId, patientId) as any;
    if (summaryRow) {
      summaryContent = summaryRow.content;
      if (summaryRow.symptoms && !symptomList.length) {
        summaryRow.symptoms.split(',').filter(Boolean).forEach((s: string) => {
          if (!symptomList.includes(s.trim())) symptomList.push(s.trim());
        });
      }
    }
  }

  if (!resolvedRiskLevel && sessionId) {
    const alerts = db.prepare(`
      SELECT level FROM risk_alerts
      WHERE patient_id = ? AND session_id = ? AND status = 'pending'
      ORDER BY CASE level WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END
      LIMIT 1
    `).all(patientId, sessionId) as any[];
    if (alerts.length > 0) {
      resolvedRiskLevel = alerts[0].level;
    }
  }

  if (!resolvedRiskLevel && summaryContent) {
    const detected = detectRiskKeywords(summaryContent);
    if (detected.some((r) => r.level === 'high')) resolvedRiskLevel = 'high';
    else if (detected.some((r) => r.level === 'medium')) resolvedRiskLevel = 'medium';
    else if (detected.length > 0) resolvedRiskLevel = 'low';
  }

  const recommendations = recommendQuestionnaires(symptomList, typeList, resolvedRiskLevel, summaryContent);

  const allQuestionnaires = db.prepare('SELECT * FROM questionnaires').all() as any[];

  const result: any[] = [];
  const usedQuestionnaireIds = new Set<string>();

  for (const rec of recommendations) {
    const matched = allQuestionnaires.find(
      (q) => q.type === rec.questionnaireType && !usedQuestionnaireIds.has(q.id)
    ) || allQuestionnaires.find(
      (q) => !usedQuestionnaireIds.has(q.id) && (
        rec.questionnaireType === 'general' ||
        q.type === rec.questionnaireType ||
        q.recommended_for?.includes(rec.questionnaireType)
      )
    );

    if (matched) {
      usedQuestionnaireIds.add(matched.id);
      const id = uuidv4();
      const insertStmt = db.prepare(`
        INSERT INTO questionnaire_recommendations (id, questionnaire_id, patient_id, session_id, reason, status)
        VALUES (?, ?, ?, ?, ?, 'recommended')
      `);
      insertStmt.run(id, matched.id, patientId, sessionId || null, rec.reason);

      result.push({
        id,
        questionnaireId: matched.id,
        questionnaireTitle: matched.title,
        questionnaireType: matched.type,
        reason: rec.reason,
        riskLevel: resolvedRiskLevel,
      });
    }
  }

  success(res, {
    patientId,
    sessionId,
    detectedRiskLevel: resolvedRiskLevel || null,
    recommendations: result,
  }, '推荐成功');
};

export const getRecommendation = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare(`
    SELECT qr.*, q.title as questionnaire_title, q.type as questionnaire_type, q.description as questionnaire_description
    FROM questionnaire_recommendations qr
    LEFT JOIN questionnaires q ON qr.questionnaire_id = q.id
    WHERE qr.id = ?
  `);
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '推荐记录不存在');
    return;
  }

  const recommendation = {
    ...rowToRecommendation(row),
    questionnaireTitle: row.questionnaire_title,
    questionnaireType: row.questionnaire_type,
  } as any;

  if (row.questionnaire_description) {
    recommendation.questionnaireDescription = row.questionnaire_description;
  }

  const pendingDelivery = db.prepare(`
    SELECT * FROM pending_deliveries WHERE related_recommendation_id = ?
  `).get(id) as any;

  if (pendingDelivery) {
    recommendation.pendingDelivery = {
      id: pendingDelivery.id,
      type: pendingDelivery.type,
      status: pendingDelivery.status,
      title: pendingDelivery.title,
      recommendedReason: pendingDelivery.recommended_reason,
      riskLevel: pendingDelivery.risk_level,
      channel: pendingDelivery.channel,
      sentBy: pendingDelivery.sent_by,
      sentAt: pendingDelivery.sent_at,
      createdAt: pendingDelivery.created_at,
    };

    if (pendingDelivery.questionnaire_id) {
      const q = db.prepare('SELECT id, title, type, description FROM questionnaires WHERE id = ?').get(pendingDelivery.questionnaire_id) as any;
      if (q) {
        recommendation.pendingDelivery.questionnaire = {
          id: q.id,
          title: q.title,
          type: q.type,
        };
      }
    }

    const sendAudit = db.prepare(`
      SELECT * FROM audit_logs
      WHERE resource_type = 'pending_delivery' AND resource_id = ? AND action = 'send_delivery'
      ORDER BY created_at DESC LIMIT 1
    `).get(pendingDelivery.id) as any;

    if (sendAudit) {
      recommendation.pendingDelivery.auditLogId = sendAudit.id;
    }

    recommendation.relatedFrom = 'pending_delivery';
  }

  success(res, recommendation);
};

export const updateRecommendationStatus = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { status } = req.body;

  const checkStmt = db.prepare('SELECT id FROM questionnaire_recommendations WHERE id = ?');
  const exists = checkStmt.get(id);
  if (!exists) {
    notFound(res, '推荐记录不存在');
    return;
  }

  const stmt = db.prepare(`
    UPDATE questionnaire_recommendations
    SET status = ?
    WHERE id = ?
  `);
  stmt.run(status, id);

  const getStmt = db.prepare('SELECT * FROM questionnaire_recommendations WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToRecommendation(row), '状态更新成功');
};
