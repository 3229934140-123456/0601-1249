import db from './index';

const initDatabase = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER,
      gender TEXT,
      phone TEXT,
      doctor_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      doctor_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      start_time TEXT,
      end_time TEXT,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS follow_up_records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      doctor_id TEXT,
      content TEXT NOT NULL,
      record_type TEXT NOT NULL DEFAULT 'text',
      symptoms TEXT,
      medication_feedback TEXT,
      is_merged INTEGER NOT NULL DEFAULT 0,
      merged_from_ids TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      record_ids TEXT NOT NULL,
      content TEXT NOT NULL,
      symptoms TEXT,
      medication_feedback TEXT,
      key_points TEXT,
      generated_by TEXT NOT NULL DEFAULT 'ai',
      status TEXT NOT NULL DEFAULT 'draft',
      confirmed_by TEXT,
      confirmed_at TEXT,
      is_sensitive_hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      session_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'other',
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT,
      assigned_to TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    CREATE TABLE IF NOT EXISTS risk_alerts (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      patient_id TEXT NOT NULL,
      record_id TEXT,
      keyword TEXT NOT NULL,
      description TEXT,
      level TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS questionnaires (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'general',
      questions TEXT NOT NULL,
      recommended_for TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questionnaire_recommendations (
      id TEXT PRIMARY KEY,
      questionnaire_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      session_id TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'recommended',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'app',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      doctor_id TEXT,
      family_member_id TEXT,
      type TEXT NOT NULL,
      template_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'app',
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (template_id) REFERENCES message_templates(id)
    );

    CREATE TABLE IF NOT EXISTS doctor_notes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS family_members (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      name TEXT NOT NULL,
      relationship TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      receive_notifications INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      request_params TEXT,
      response_data TEXT,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS retracted_contents (
      id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      original_content TEXT NOT NULL,
      reason TEXT,
      retracted_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_patient_id ON sessions(patient_id);
    CREATE INDEX IF NOT EXISTS idx_records_session_id ON follow_up_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_records_patient_id ON follow_up_records(patient_id);
    CREATE INDEX IF NOT EXISTS idx_summaries_session_id ON summaries(session_id);
    CREATE INDEX IF NOT EXISTS idx_summaries_patient_id ON summaries(patient_id);
    CREATE INDEX IF NOT EXISTS idx_todos_patient_id ON todos(patient_id);
    CREATE INDEX IF NOT EXISTS idx_risk_alerts_patient_id ON risk_alerts(patient_id);
    CREATE INDEX IF NOT EXISTS idx_risk_alerts_status ON risk_alerts(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_patient_id ON notifications(patient_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
  `);

  console.log('数据库表创建完成');
};

const seedData = () => {
  const { v4: uuidv4 } = require('uuid');

  const patientCount = (db.prepare('SELECT COUNT(*) as count FROM patients').get() as { count: number }).count;
  if (patientCount > 0) {
    console.log('已存在数据，跳过初始化数据');
    return;
  }

  const patient1Id = uuidv4();
  const patient2Id = uuidv4();

  const insertPatient = db.prepare(`
    INSERT INTO patients (id, name, age, gender, phone, doctor_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertPatient.run(patient1Id, '张三', 45, '男', '13800138001', 'doctor-001');
  insertPatient.run(patient2Id, '李四', 32, '女', '13800138002', 'doctor-001');

  const session1Id = uuidv4();
  const session2Id = uuidv4();

  const insertSession = db.prepare(`
    INSERT INTO sessions (id, patient_id, doctor_id, title, status, start_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertSession.run(session1Id, patient1Id, 'doctor-001', '高血压随访-第3次', 'active', '2024-01-15 09:00:00');
  insertSession.run(session2Id, patient2Id, 'doctor-001', '糖尿病随访-第2次', 'active', '2024-01-16 14:00:00');

  const insertRecord = db.prepare(`
    INSERT INTO follow_up_records (id, session_id, patient_id, doctor_id, content, record_type, symptoms, medication_feedback)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertRecord.run(
    uuidv4(),
    session1Id,
    patient1Id,
    'doctor-001',
    '患者近一周血压控制尚可，早上测量一般在135/85左右。偶尔有头晕症状，下午比较明显。',
    'text',
    '头晕',
    '按时服用硝苯地平，无明显不良反应'
  );
  insertRecord.run(
    uuidv4(),
    session1Id,
    patient1Id,
    'doctor-001',
    '今天早上感觉胸闷，持续了约10分钟，休息后缓解。昨天晚上睡眠不太好。',
    'text',
    '胸闷,睡眠差',
    '继续服药中'
  );

  const insertTemplate = db.prepare(`
    INSERT INTO message_templates (id, name, type, title, content, channel, is_default)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertTemplate.run(
    uuidv4(),
    '复诊提醒',
    'reminder',
    '复诊提醒',
    '您好，提醒您按时复诊。如有不适请及时就医。',
    'all',
    1
  );
  insertTemplate.run(
    uuidv4(),
    '用药提醒',
    'reminder',
    '用药提醒',
    '您好，请记得按时服药，保持良好的生活习惯。',
    'all',
    1
  );
  insertTemplate.run(
    uuidv4(),
    '家属关怀',
    'greeting',
    '家属关怀通知',
    '您好，患者近期随访情况良好，感谢您的关心与支持。',
    'app',
    0
  );

  const insertQuestionnaire = db.prepare(`
    INSERT INTO questionnaires (id, title, description, type, questions, recommended_for)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertQuestionnaire.run(
    uuidv4(),
    '高血压症状评估问卷',
    '用于评估高血压患者近期症状情况',
    'symptom',
    JSON.stringify([
      { id: 1, question: '近期是否有头痛症状？', type: 'single', options: ['无', '偶尔', '经常', '持续'] },
      { id: 2, question: '近期是否有头晕症状？', type: 'single', options: ['无', '偶尔', '经常', '持续'] },
      { id: 3, question: '近期血压控制情况如何？', type: 'single', options: ['很好', '一般', '较差', '很差'] }
    ]),
    '高血压'
  );
  insertQuestionnaire.run(
    uuidv4(),
    '用药依从性问卷',
    '了解患者用药依从情况',
    'medication',
    JSON.stringify([
      { id: 1, question: '您是否按时服药？', type: 'single', options: ['总是', '经常', '偶尔', '从不'] },
      { id: 2, question: '您是否有漏服情况？', type: 'single', options: ['无', '偶尔', '经常'] },
      { id: 3, question: '服药后是否有不良反应？', type: 'text' }
    ]),
    '通用'
  );

  console.log('初始化数据完成');
};

initDatabase();
seedData();

console.log('数据库初始化完成');
