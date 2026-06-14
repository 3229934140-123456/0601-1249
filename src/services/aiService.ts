const RISK_KEYWORDS: { keyword: string; level: 'low' | 'medium' | 'high' }[] = [
  { keyword: '胸痛', level: 'high' },
  { keyword: '胸闷', level: 'high' },
  { keyword: '呼吸困难', level: 'high' },
  { keyword: '心悸', level: 'medium' },
  { keyword: '头晕', level: 'medium' },
  { keyword: '头痛', level: 'medium' },
  { keyword: '恶心', level: 'low' },
  { keyword: '呕吐', level: 'medium' },
  { keyword: '发烧', level: 'medium' },
  { keyword: '发热', level: 'medium' },
  { keyword: '剧烈疼痛', level: 'high' },
  { keyword: '昏迷', level: 'high' },
  { keyword: '意识模糊', level: 'high' },
  { keyword: '血压高', level: 'medium' },
  { keyword: '血压低', level: 'medium' },
  { keyword: '血糖高', level: 'medium' },
  { keyword: '血糖低', level: 'medium' },
  { keyword: '过敏', level: 'medium' },
  { keyword: '皮疹', level: 'low' },
  { keyword: '水肿', level: 'medium' },
  { keyword: '失眠', level: 'low' },
  { keyword: '睡眠差', level: 'low' },
  { keyword: '疲劳', level: 'low' },
  { keyword: '乏力', level: 'low' },
  { keyword: '出血', level: 'high' },
  { keyword: '咳血', level: 'high' },
  { keyword: '便血', level: 'high' },
  { keyword: '尿血', level: 'high' },
  { keyword: '体重下降', level: 'medium' },
  { keyword: '食欲差', level: 'low' },
];

const SYMPTOM_PATTERNS = [
  /([\u4e00-\u9fa5]{1,10}(痛|晕|胀|麻|痒|肿|热|冷|酸|沉|紧|闷|堵|慌|跳|抖|乏|累|困))/g,
  /(感到|感觉|有)([\u4e00-\u9fa5]{1,8}(不适|症状|感觉))/g,
  /(出现|发生|产生)([\u4e00-\u9fa5]{1,10}(症状|情况|现象))/g,
];

const MEDICATION_PATTERNS = [
  /(服用|吃|使用)([\u4e00-\u9fa5A-Za-z0-9]{2,20}(片|粒|丸|剂|药|胶囊|颗粒))/g,
  /(按时|坚持|继续|没有|忘了|漏)(服药|吃药|用药)/g,
  /(不良反应|副作用|反应)(是|有|为)?([\u4e00-\u9fa5]{0,20})/g,
];

const SENSITIVE_PATTERNS = [
  /(身份证|证件)(号码|号)?[:：]?\s*[0-9Xx]{15,18}/g,
  /(手机号|电话|手机)[:：]?\s*1[3-9]\d{9}/g,
  /(地址|住址|家庭地址)[:：]?\s*[\u4e00-\u9fa50-9]{5,50}/g,
  /(姓名|患者姓名)[:：]?\s*[\u4e00-\u9fa5]{2,4}/g,
];

export const extractSymptoms = (content: string): string[] => {
  const symptoms: string[] = [];

  for (const { keyword } of RISK_KEYWORDS) {
    if (content.includes(keyword) && !symptoms.includes(keyword)) {
      symptoms.push(keyword);
    }
  }

  for (const pattern of SYMPTOM_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        if (!symptoms.some((s) => match.includes(s) || s.includes(match))) {
          symptoms.push(match);
        }
      }
    }
  }

  return symptoms.slice(0, 10);
};

export const extractMedicationFeedback = (content: string): { medications: string[]; feedback: string } => {
  const medications: string[] = [];
  let feedback = '';

  for (const pattern of MEDICATION_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach((m) => medications.push(m));
    }
  }

  const feedbackPatterns = [
    /(不良反应|副作用)[：:]?([\u4e00-\u9fa5，。、；\s]{0,50})/,
    /(感觉|觉得)[\u4e00-\u9fa5]{0,10}(好|不好|不错|差|一般)/,
    /(效果|疗效)[\u4e00-\u9fa5]{0,5}(好|不好|明显|不明显|一般)/,
  ];

  for (const pattern of feedbackPatterns) {
    const match = content.match(pattern);
    if (match) {
      feedback = match[0];
      break;
    }
  }

  return { medications, feedback };
};

export const detectRiskKeywords = (content: string): { keyword: string; level: 'low' | 'medium' | 'high' }[] => {
  const detected: { keyword: string; level: 'low' | 'medium' | 'high' }[] = [];

  for (const item of RISK_KEYWORDS) {
    if (content.includes(item.keyword)) {
      detected.push(item);
    }
  }

  return detected;
};

export const generateSummary = (records: { content: string; symptoms?: string; medicationFeedback?: string }[]): {
  content: string;
  symptoms: string;
  medicationFeedback: string;
  keyPoints: string;
} => {
  const allContent = records.map((r) => r.content).join(' ');
  const allSymptoms = records.flatMap((r) => (r.symptoms ? r.symptoms.split(/[,，、]/) : extractSymptoms(r.content)));
  const uniqueSymptoms = [...new Set(allSymptoms.filter((s) => s.trim()))];

  const allMedFeedback = records.map((r) => r.medicationFeedback || '').filter((m) => m.trim());
  const { medications, feedback } = extractMedicationFeedback(allContent);

  const keyPoints: string[] = [];

  if (uniqueSymptoms.length > 0) {
    keyPoints.push(`主要症状：${uniqueSymptoms.join('、')}`);
  }

  if (medications.length > 0 || allMedFeedback.length > 0) {
    const medSummary = medications.length > 0 ? medications.join('、') : '有用药记录';
    keyPoints.push(`用药情况：${medSummary}`);
  }

  if (feedback) {
    keyPoints.push(`用药反馈：${feedback}`);
  }

  const summaryContent = `本次随访记录共${records.length}条。${
    uniqueSymptoms.length > 0 ? `患者主要症状包括：${uniqueSymptoms.join('、')}。` : '未提及明显症状。'
  }${
    allMedFeedback.length > 0 || medications.length > 0
      ? `用药方面，${medications.length > 0 ? '患者服用' + medications.join('、') : '有相关用药记录'}。${feedback ? feedback + '。' : ''}`
      : '未提及用药情况。'
  }建议医生结合具体情况进行评估。`;

  return {
    content: summaryContent,
    symptoms: uniqueSymptoms.join(','),
    medicationFeedback: allMedFeedback.join('; ') || feedback,
    keyPoints: JSON.stringify(keyPoints),
  };
};

export const recommendQuestionnaires = (
  symptoms: string[],
  recordTypes: string[]
): { questionnaireId: string; reason: string }[] => {
  const recommendations: { questionnaireId: string; reason: string }[] = [];

  const hasBloodPressureSymptoms = symptoms.some((s) =>
    ['头晕', '头痛', '血压高', '血压低', '胸闷', '心悸'].includes(s)
  );
  if (hasBloodPressureSymptoms) {
    recommendations.push({
      questionnaireId: '',
      reason: '患者存在血压相关症状，建议进行症状评估',
    });
  }

  if (recordTypes.includes('medication') || symptoms.some((s) => ['不良反应', '副作用'].includes(s))) {
    recommendations.push({
      questionnaireId: '',
      reason: '需要了解患者用药依从性情况',
    });
  }

  return recommendations;
};

export const hideSensitiveContent = (content: string): string => {
  let result = content;

  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (match) => {
      if (match.includes('身份证') || match.includes('证件')) {
        return '身份证号：***';
      }
      if (match.includes('手机') || match.includes('电话')) {
        return '手机号：***';
      }
      if (match.includes('地址')) {
        return '地址：***';
      }
      if (match.includes('姓名')) {
        return '姓名：***';
      }
      return '***';
    });
  }

  return result;
};

export const getRiskKeywords = () => RISK_KEYWORDS;
