import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { success, notFound, paginated, badRequest } from '../utils/response';
import { PendingDelivery } from '../types';
import {
  recommendQuestionnaires,
  recommendFamilyReminder,
  detectRiskKeywords,
} from '../services/aiService';

const rowToDelivery = (row: any): PendingDelivery => ({
  id: row.id,
  patientId: row.patient_id,
  sessionId: row.session_id,
  summaryId: row.summary_id,
  type: row.type,
  status: row.status,
  title: row.title,
  content: row.content,
  templateId: row.template_id,
  questionnaireId: row.questionnaire_id,
  familyMemberId: row.family_member_id,
  recommendedReason: row.recommended_reason,
  riskLevel: row.risk_level,
  channel: row.channel,
  sentBy: row.sent_by,
  sentAt: row.sent_at,
  relatedNotificationId: row.related_notification_id,
  relatedRecommendationId: row.related_recommendation_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const getPendingDeliveries = (req: Request, res: Response): void => {
  const { patientId, sessionId, type, status, page = 1, pageSize = 20 } = req.query;

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
  if (type) {
    whereClause += ' AND type = ?';
    params.push(type);
  }
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total FROM pending_deliveries ${whereClause}`);
  const { total } = countStmt.get(...params) as { total: number };

  const stmt = db.prepare(`
    SELECT * FROM pending_deliveries ${whereClause}
    ORDER BY
      CASE risk_level WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
      created_at DESC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(...params, pageSizeNum, offset) as any[];

  const deliveries = rows.map(rowToDelivery);

  const enriched = deliveries.map((d) => {
    const result: any = { ...d };
    if (d.questionnaireId) {
      const q = db.prepare('SELECT title, type, description FROM questionnaires WHERE id = ?').get(d.questionnaireId) as any;
      if (q) {
        result.questionnaire = { id: q.id, title: q.title, type: q.type, description: q.description };
      }
    }
    if (d.familyMemberId) {
      const f = db.prepare('SELECT name, relationship, phone FROM family_members WHERE id = ?').get(d.familyMemberId) as any;
      if (f) {
        result.familyMember = { id: f.id, name: f.name, relationship: f.relationship, phone: f.phone };
      }
    }
    if (d.templateId) {
      const t = db.prepare('SELECT name, type, title, content FROM message_templates WHERE id = ?').get(d.templateId) as any;
      if (t) {
        result.template = { id: t.id, name: t.name, type: t.type, title: t.title, content: t.content };
      }
    }
    if (d.relatedNotificationId) {
      const n = db.prepare('SELECT id, title, status, sent_at FROM notifications WHERE id = ?').get(d.relatedNotificationId) as any;
      if (n) {
        result.notification = { id: n.id, title: n.title, status: n.status, sentAt: n.sent_at };
      }
    }
    return result;
  });

  paginated(res, enriched, total, pageNum, pageSizeNum);
};

export const getDeliveryPreview = (req: Request, res: Response): void => {
  const { patientId, sessionId, summaryId } = req.body;

  if (!patientId) {
    badRequest(res, '患者ID不能为空');
    return;
  }

  let resolvedRiskLevel: 'low' | 'medium' | 'high' | undefined;
  let summaryContent: string | undefined;
  let symptoms: string[] = [];

  if (summaryId) {
    const summaryRow = db.prepare('SELECT content, symptoms FROM summaries WHERE id = ? AND patient_id = ?').get(summaryId, patientId) as any;
    if (summaryRow) {
      summaryContent = summaryRow.content;
      if (summaryRow.symptoms) {
        symptoms = summaryRow.symptoms.split(',').filter(Boolean);
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

  const questionnaireRecs = recommendQuestionnaires(symptoms, [], resolvedRiskLevel, summaryContent);
  const reminderRec = recommendFamilyReminder(resolvedRiskLevel, summaryContent);

  const allQuestionnaires = db.prepare('SELECT * FROM questionnaires').all() as any[];
  const allTemplates = db.prepare('SELECT * FROM message_templates').all() as any[];
  const familyMembers = db.prepare(`
    SELECT * FROM family_members WHERE patient_id = ? AND receive_notifications = 1
  `).all(patientId) as any[];

  const pendingItems: any[] = [];
  const usedQIds = new Set<string>();

  for (const rec of questionnaireRecs) {
    const matched = allQuestionnaires.find(
      (q) => q.type === rec.questionnaireType && !usedQIds.has(q.id)
    ) || allQuestionnaires.find(
      (q) => !usedQIds.has(q.id) && q.type === rec.questionnaireType
    ) || allQuestionnaires.find((q) => !usedQIds.has(q.id));

    if (matched) {
      usedQIds.add(matched.id);
      const id = uuidv4();
      pendingItems.push({
        id,
        type: 'questionnaire',
        title: matched.title,
        content: matched.description,
        questionnaireId: matched.id,
        questionnaire: {
          id: matched.id,
          title: matched.title,
          type: matched.type,
          description: matched.description,
        },
        recommendedReason: rec.reason,
        riskLevel: resolvedRiskLevel,
        patientId,
        sessionId,
        summaryId,
      });
    }
  }

  const matchedTemplate = allTemplates.find(
    (t) => t.type === reminderRec.templateType
  ) || allTemplates.find((t) => t.type === 'reminder') || allTemplates[0];

  if (matchedTemplate) {
    const id = uuidv4();
    pendingItems.push({
      id,
      type: 'family_reminder',
      title: matchedTemplate.title,
      content: matchedTemplate.content,
      templateId: matchedTemplate.id,
      template: {
        id: matchedTemplate.id,
        name: matchedTemplate.name,
        type: matchedTemplate.type,
        title: matchedTemplate.title,
        content: matchedTemplate.content,
        channel: matchedTemplate.channel,
      },
      recommendedReason: reminderRec.reason,
      urgency: reminderRec.urgency,
      riskLevel: resolvedRiskLevel,
      patientId,
      sessionId,
      summaryId,
      availableFamilyMembers: familyMembers.map((f) => ({
        id: f.id,
        name: f.name,
        relationship: f.relationship,
        phone: f.phone,
      })),
    });
  }

  success(res, {
    patientId,
    sessionId,
    summaryId,
    detectedRiskLevel: resolvedRiskLevel || null,
    pendingCount: pendingItems.length,
    items: pendingItems,
  });
};

export const savePendingDeliveries = (req: Request, res: Response): void => {
  const { items, confirmedBy } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    badRequest(res, '请提供要保存的待发送项列表');
    return;
  }

  if (!confirmedBy) {
    badRequest(res, '确认人不能为空');
    return;
  }

  const results: { id: string; success: boolean; message: string }[] = [];

  for (const item of items) {
    const { id, patientId, sessionId, summaryId, type, title, content, templateId, questionnaireId, familyMemberId, recommendedReason, riskLevel, channel } = item;

    if (!patientId || !type || !title) {
      results.push({ id: id || uuidv4(), success: false, message: '缺少必要字段' });
      continue;
    }

    try {
      const newId = id || uuidv4();
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO pending_deliveries
        (id, patient_id, session_id, summary_id, type, status, title, content, template_id,
         questionnaire_id, family_member_id, recommended_reason, risk_level, channel, sent_by)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        newId,
        patientId,
        sessionId || null,
        summaryId || null,
        type,
        title,
        content || null,
        templateId || null,
        questionnaireId || null,
        familyMemberId || null,
        recommendedReason || null,
        riskLevel || null,
        channel || 'app',
        confirmedBy
      );
      results.push({ id: newId, success: true, message: '已保存到待发送队列' });
    } catch (e: any) {
      results.push({ id: id || uuidv4(), success: false, message: e.message || '保存失败' });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  success(
    res,
    {
      total: items.length,
      successCount,
      failedCount: items.length - successCount,
      results,
    },
    `保存完成：${successCount}条成功，${items.length - successCount}条失败`
  );
};

export const confirmAndSendDeliveries = (req: Request, res: Response): void => {
  const { ids, confirmedBy } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    badRequest(res, '请提供要发送的待发送项ID列表');
    return;
  }

  if (!confirmedBy) {
    badRequest(res, '确认人不能为空');
    return;
  }

  const results: {
    id: string;
    success: boolean;
    code: string;
    message: string;
    notificationId?: string;
    recommendationId?: string;
    auditLogId?: string;
  }[] = [];

  for (const deliveryId of ids) {
    const delivery = db.prepare('SELECT * FROM pending_deliveries WHERE id = ?').get(deliveryId) as any;

    if (!delivery) {
      results.push({ id: deliveryId, success: false, code: 'NOT_FOUND', message: '未找到待发送项' });
      continue;
    }

    if (delivery.status === 'sent') {
      results.push({ id: deliveryId, success: false, code: 'ALREADY_SENT', message: '已发送，不可重复操作' });
      continue;
    }

    try {
      let notificationId: string | undefined;
      let recommendationId: string | undefined;

      if (delivery.type === 'family_reminder' || delivery.type === 'notification') {
        const notifyId = uuidv4();
        const stmt = db.prepare(`
          INSERT INTO notifications (id, patient_id, doctor_id, family_member_id, type, template_id, title, content, channel, status, sent_at)
          VALUES (?, ?, ?, ?, 'reminder', ?, ?, ?, ?, 'sent', datetime('now'))
        `);
        stmt.run(
          notifyId,
          delivery.patient_id,
          confirmedBy,
          delivery.family_member_id || null,
          delivery.template_id || null,
          delivery.title,
          delivery.content || '',
          delivery.channel || 'app'
        );
        notificationId = notifyId;
      }

      if (delivery.type === 'questionnaire') {
        const recId = uuidv4();
        const stmt = db.prepare(`
          INSERT INTO questionnaire_recommendations (id, questionnaire_id, patient_id, session_id, reason, status)
          VALUES (?, ?, ?, ?, ?, 'sent')
        `);
        stmt.run(
          recId,
          delivery.questionnaire_id,
          delivery.patient_id,
          delivery.session_id || null,
          delivery.recommended_reason || '医生确认发送'
        );
        recommendationId = recId;
      }

      const updateStmt = db.prepare(`
        UPDATE pending_deliveries
        SET status = 'sent', sent_by = ?, sent_at = datetime('now'),
            related_notification_id = ?, related_recommendation_id = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `);
      updateStmt.run(confirmedBy, notificationId || null, recommendationId || null, deliveryId);

      const auditLogId = uuidv4();
      const auditStmt = db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, response_data, status)
        VALUES (?, ?, 'send_delivery', 'pending_delivery', ?, ?, 'success')
      `);
      const auditData = JSON.stringify({ notificationId, recommendationId, deliveryId });
      auditStmt.run(auditLogId, confirmedBy, deliveryId, auditData);

      results.push({
        id: deliveryId,
        success: true,
        code: 'OK',
        message: '发送成功',
        notificationId,
        recommendationId,
        auditLogId,
      });
    } catch (e: any) {
      results.push({ id: deliveryId, success: false, code: 'ERROR', message: e.message || '发送失败' });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  success(
    res,
    {
      total: ids.length,
      successCount,
      failedCount: ids.length - successCount,
      confirmedBy,
      sentAt: new Date().toISOString(),
      results,
    },
    `发送完成：${successCount}条成功，${ids.length - successCount}条失败`
  );
};

export const updateDelivery = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { title, content, templateId, questionnaireId, familyMemberId, channel } = req.body;

  const checkStmt = db.prepare('SELECT id, status FROM pending_deliveries WHERE id = ?');
  const existing = checkStmt.get(id) as any;
  if (!existing) {
    notFound(res, '待发送项不存在');
    return;
  }

  if (existing.status === 'sent') {
    badRequest(res, '已发送的项目不可修改');
    return;
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (title !== undefined) { updates.push('title = ?'); params.push(title); }
  if (content !== undefined) { updates.push('content = ?'); params.push(content); }
  if (templateId !== undefined) { updates.push('template_id = ?'); params.push(templateId); }
  if (questionnaireId !== undefined) { updates.push('questionnaire_id = ?'); params.push(questionnaireId); }
  if (familyMemberId !== undefined) { updates.push('family_member_id = ?'); params.push(familyMemberId); }
  if (channel !== undefined) { updates.push('channel = ?'); params.push(channel); }

  if (updates.length === 0) {
    badRequest(res, '没有需要更新的字段');
    return;
  }

  updates.push('updated_at = datetime("now")');
  params.push(id);

  const stmt = db.prepare(`UPDATE pending_deliveries SET ${updates.join(', ')} WHERE id = ?`);
  stmt.run(...params);

  const getStmt = db.prepare('SELECT * FROM pending_deliveries WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToDelivery(row), '更新成功');
};

export const cancelDelivery = (req: Request, res: Response): void => {
  const { id } = req.params;
  const { cancelledBy } = req.body;

  const checkStmt = db.prepare('SELECT id, status FROM pending_deliveries WHERE id = ?');
  const existing = checkStmt.get(id) as any;
  if (!existing) {
    notFound(res, '待发送项不存在');
    return;
  }

  if (existing.status === 'sent') {
    badRequest(res, '已发送的项目不可取消');
    return;
  }

  const stmt = db.prepare(`
    UPDATE pending_deliveries
    SET status = 'cancelled', sent_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  stmt.run(cancelledBy || null, id);

  const getStmt = db.prepare('SELECT * FROM pending_deliveries WHERE id = ?');
  const row = getStmt.get(id) as any;

  success(res, rowToDelivery(row), '已取消');
};

export const getDeliveryDetail = (req: Request, res: Response): void => {
  const { id } = req.params;

  const stmt = db.prepare('SELECT * FROM pending_deliveries WHERE id = ?');
  const row = stmt.get(id) as any;

  if (!row) {
    notFound(res, '待发送项不存在');
    return;
  }

  const delivery = rowToDelivery(row) as any;

  if (delivery.questionnaireId) {
    delivery.questionnaire = db.prepare('SELECT * FROM questionnaires WHERE id = ?').get(delivery.questionnaireId);
  }
  if (delivery.familyMemberId) {
    delivery.familyMember = db.prepare('SELECT * FROM family_members WHERE id = ?').get(delivery.familyMemberId);
  }
  if (delivery.templateId) {
    delivery.template = db.prepare('SELECT * FROM message_templates WHERE id = ?').get(delivery.templateId);
  }
  if (delivery.relatedNotificationId) {
    delivery.notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(delivery.relatedNotificationId);
  }
  if (delivery.relatedRecommendationId) {
    delivery.recommendation = db.prepare('SELECT * FROM questionnaire_recommendations WHERE id = ?').get(delivery.relatedRecommendationId);
  }

  if (delivery.relatedNotificationId || delivery.relatedRecommendationId) {
    const auditStmt = db.prepare(`
      SELECT * FROM audit_logs
      WHERE resource_type = 'pending_delivery' AND resource_id = ? AND action = 'send_delivery'
      ORDER BY created_at DESC LIMIT 1
    `);
    delivery.auditLog = auditStmt.get(id);
  }

  success(res, delivery);
};

export const getDeliveryRelatedRecords = (req: Request, res: Response): void => {
  const { id } = req.params;

  const delivery = db.prepare('SELECT * FROM pending_deliveries WHERE id = ?').get(id) as any;
  if (!delivery) {
    notFound(res, '待发送项不存在');
    return;
  }

  const result: any = {
    deliveryId: id,
    notification: null,
    questionnaireRecommendation: null,
    auditLogs: [],
  };

  if (delivery.related_notification_id) {
    result.notification = db.prepare('SELECT * FROM notifications WHERE id = ?').get(delivery.related_notification_id);
  }

  if (delivery.related_recommendation_id) {
    result.questionnaireRecommendation = db.prepare('SELECT * FROM questionnaire_recommendations WHERE id = ?').get(delivery.related_recommendation_id);
  }

  const auditStmt = db.prepare(`
    SELECT * FROM audit_logs
    WHERE (resource_type = 'pending_delivery' AND resource_id = ?)
       OR (resource_type = 'notification' AND resource_id = ?)
       OR (resource_type = 'questionnaire' AND resource_id = ?)
    ORDER BY created_at DESC
  `);
  result.auditLogs = auditStmt.all(
    id,
    delivery.related_notification_id || '',
    delivery.related_recommendation_id || ''
  );

  success(res, result);
};
