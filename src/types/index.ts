export interface Patient {
  id: string;
  name: string;
  age?: number;
  gender?: string;
  phone?: string;
  doctorId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  patientId: string;
  doctorId?: string;
  title: string;
  status: 'active' | 'completed' | 'cancelled';
  startTime?: string;
  endTime?: string;
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpRecord {
  id: string;
  sessionId: string;
  patientId: string;
  doctorId?: string;
  content: string;
  recordType: 'text' | 'voice' | 'image';
  symptoms?: string;
  medicationFeedback?: string;
  isMerged: number;
  mergedFromIds?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Summary {
  id: string;
  sessionId: string;
  patientId: string;
  recordIds: string;
  content: string;
  symptoms: string;
  medicationFeedback: string;
  keyPoints: string;
  generatedBy: 'ai' | 'manual';
  status: 'draft' | 'confirmed' | 'rejected';
  confirmedBy?: string;
  confirmedAt?: string;
  isSensitiveHidden: number;
  createdAt: string;
  updatedAt: string;
}

export interface Todo {
  id: string;
  patientId: string;
  sessionId?: string;
  title: string;
  description?: string;
  type: 'followup' | 'medication' | 'exam' | 'other';
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  dueDate?: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskAlert {
  id: string;
  sessionId?: string;
  patientId: string;
  recordId?: string;
  keyword: string;
  description?: string;
  level: 'low' | 'medium' | 'high';
  status: 'pending' | 'reviewed' | 'ignored';
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Questionnaire {
  id: string;
  title: string;
  description?: string;
  type: 'symptom' | 'quality_of_life' | 'medication' | 'general';
  questions: string;
  recommendedFor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionnaireRecommendation {
  id: string;
  questionnaireId: string;
  patientId: string;
  sessionId?: string;
  reason?: string;
  status: 'recommended' | 'sent' | 'completed';
  createdAt: string;
}

export interface Notification {
  id: string;
  patientId?: string;
  doctorId?: string;
  familyMemberId?: string;
  type: 'reminder' | 'alert' | 'info';
  templateId?: string;
  title: string;
  content: string;
  channel: 'sms' | 'app' | 'email';
  status: 'pending' | 'sent' | 'failed';
  sentAt?: string;
  createdAt: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  type: 'reminder' | 'followup' | 'alert' | 'greeting';
  title: string;
  content: string;
  channel: 'sms' | 'app' | 'email' | 'all';
  isDefault: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestParams?: string;
  responseData?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

export interface RetractedContent {
  id: string;
  resourceType: string;
  resourceId: string;
  originalContent: string;
  reason?: string;
  retractedBy: string;
  createdAt: string;
}

export interface DoctorNote {
  id: string;
  sessionId: string;
  patientId: string;
  doctorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface FamilyMember {
  id: string;
  patientId: string;
  name: string;
  relationship: string;
  phone?: string;
  email?: string;
  receiveNotifications: number;
  createdAt: string;
}

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
