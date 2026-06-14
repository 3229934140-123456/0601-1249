import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { success, notFound, paginated, badRequest } from '../utils/response';
import { Questionnaire, QuestionnaireRecommendation } from '../types';
import { recommendQuestionnaires } from '../services/aiService';

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
  const { patientId, sessionId, symptoms, recordTypes } = req.body;

  if (!patientId) {
    badRequest(res, '患者ID不能为空');
    return;
  }

  const symptomList = Array.isArray(symptoms) ? symptoms : symptoms ? [symptoms] : [];
  const typeList = Array.isArray(recordTypes) ? recordTypes : [];

  const recommendations = recommendQuestionnaires(symptomList, typeList);

  const allQuestionnaires = db.prepare('SELECT * FROM questionnaires').all() as any[];

  const result: any[] = [];
  for (const rec of recommendations) {
    let matchedQuestionnaire = allQuestionnaires.find(
      (q) => symptomList.some((s: string) => q.recommended_for?.includes(s))
    );

    if (!matchedQuestionnaire && allQuestionnaires.length > 0) {
      matchedQuestionnaire = allQuestionnaires[0];
    }

    if (matchedQuestionnaire) {
      const id = uuidv4();
      const insertStmt = db.prepare(`
        INSERT INTO questionnaire_recommendations (id, questionnaire_id, patient_id, session_id, reason, status)
        VALUES (?, ?, ?, ?, ?, 'recommended')
      `);
      insertStmt.run(id, matchedQuestionnaire.id, patientId, sessionId || null, rec.reason);

      result.push({
        id,
        questionnaireId: matchedQuestionnaire.id,
        questionnaireTitle: matchedQuestionnaire.title,
        reason: rec.reason,
      });
    }
  }

  if (result.length === 0 && allQuestionnaires.length > 0) {
    const q = allQuestionnaires[0];
    const id = uuidv4();
    const insertStmt = db.prepare(`
      INSERT INTO questionnaire_recommendations (id, questionnaire_id, patient_id, session_id, reason, status)
      VALUES (?, ?, ?, ?, ?, 'recommended')
    `);
    insertStmt.run(id, q.id, patientId, sessionId || null, '根据患者情况推荐');
    result.push({
      id,
      questionnaireId: q.id,
      questionnaireTitle: q.title,
      reason: '根据患者情况推荐',
    });
  }

  success(res, result, '推荐成功');
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
