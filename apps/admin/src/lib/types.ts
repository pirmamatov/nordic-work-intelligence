import type { RoleCode, TaskPriority, TaskStatus, WorkSchedule } from '@nwi/shared';

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Me {
  id: string;
  email: string;
  fullName: string;
  roles: RoleCode[];
  permissions: string[];
  employeeId: string | null;
  departmentId: string | null;
  mfaEnabled: boolean;
  mfaPending: boolean;
  mfaSetupRequired: boolean;
  mustChangePassword: boolean;
}

export interface AuthResponse {
  csrfToken: string;
  user: Me;
}

export interface DepartmentRef {
  id: string;
  name: string;
  code: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: RoleCode[];
  extraPermissions: string[];
  employee: {
    id: string;
    position: string | null;
    employeeNumber: string | null;
    hiredAt: string | null;
    isActive: boolean;
    monitoringConsentAt: string | null;
    department: DepartmentRef | null;
  } | null;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  createdAt: string;
  head: { id: string; fullName: string } | null;
  employeeCount: number;
  childCount: number;
}

export interface AgentRow {
  id: string;
  agentVersion: string;
  status: 'ACTIVE' | 'REVOKED';
  lastSeenAt: string | null;
  queueDepth: number | null;
  revokedAt: string | null;
  createdAt: string;
  online: boolean;
  workstation: {
    id: string;
    hostname: string;
    osVersion: string | null;
    employee: { id: string; user: { fullName: string }; department: { name: string } | null };
  };
}

export interface Dashboard {
  date: string;
  timezone: string;
  generatedAt: string;
  employees: { total: number; activeToday: number };
  tasks: {
    total: number;
    done: number;
    inReview: number;
    overdue: number;
    completionPct: number | null;
  };
  agents: { online: number; offline: number };
  today: { activeSec: number; idleSec: number };
  week: { date: string; activeSec: number; idleSec: number }[];
  topApplications: { displayName: string; category: string; activeSec: number }[];
}

export interface Application {
  id: string;
  processName: string;
  displayName: string;
  category: string;
  workRelevance: string;
}

export interface SummaryMeta {
  from: string;
  to: string;
  timezone: string;
  generatedAt: string;
  definitions: { activeSec: string; idleSec: string };
}

export interface Totals {
  activeSec: number;
  idleSec: number;
  eventCount: number;
}

export interface Summary<T> {
  meta: SummaryMeta;
  items: T[];
}

export type AppSummaryRow = Totals & { application: Application | null };
export type EmployeeSummaryRow = Totals & { employeeId: string; fullName: string | null };
export type DaySummaryRow = Totals & { date: string };

export interface WorkDay {
  employeeId: string;
  date: string;
  observedSec: number;
  activeSec: number;
  idleSec: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface TimelineEvent {
  id: string;
  startedAt: string;
  endedAt: string;
  activeSec: number;
  idleSec: number;
  state: string;
  domain: string | null;
  source: string;
  confidence: string;
  application: Application;
}

export interface ScreenshotRow {
  id: string;
  capturedAt: string;
  sizeBytes: number;
  expiresAt: string;
}

export interface Policy {
  id: string;
  name: string;
  workSchedule: WorkSchedule;
  timezone: string;
  idleThresholdSec: number;
  screenshotsEnabled: boolean;
  screenshotIntervalSec: number;
  excludedProcesses: string[];
  allowedDomains: string[];
  version: number;
  isDefault: boolean;
  assignments: {
    department: { id: string; name: string } | null;
    employee: { id: string; user: { fullName: string } } | null;
  }[];
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  diff: unknown;
  occurredAt: string;
  actorUser: { id: string; fullName: string; email: string } | null;
  actorAgentId: string | null;
}

export interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface RolesResponse {
  roles: { code: RoleCode; name: string; requiresMfa: boolean; permissions: string[] }[];
  permissions: { code: string; description: string }[];
}

export interface PersonRef {
  id: string;
  fullName: string;
}

export interface CriterionRef {
  id: string;
  code: string;
  title: string;
}

export interface TaskListItem {
  id: string;
  title: string;
  direction: string | null;
  dueAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  progressPct: number;
  owner: PersonRef;
  criterion: CriterionRef | null;
  documentCount: number;
  overdue: boolean;
}

export interface DocumentVersionRow {
  id: string;
  versionNo: number;
  fileName: string;
  sizeBytes: number;
  note: string | null;
  createdAt: string;
  uploadedBy: PersonRef;
}

export interface TaskDocument {
  id: string;
  title: string;
  status: 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'NEEDS_FIX' | 'APPROVED';
  aiAssisted: 'YES' | 'NO' | 'UNKNOWN';
  qualityScore: number | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdBy: PersonRef;
  reviewer: PersonRef | null;
  versions: DocumentVersionRow[];
}

export interface TaskDetail extends Omit<TaskListItem, 'documentCount'> {
  description: string | null;
  expectedResult: string | null;
  delayReason: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: PersonRef;
  acceptedBy: PersonRef | null;
  collaborators: PersonRef[];
  statusHistory: {
    id: string;
    fromStatus: TaskStatus | null;
    toStatus: TaskStatus;
    comment: string | null;
    changedAt: string;
    changedBy: PersonRef;
  }[];
  comments: { id: string; body: string; createdAt: string; author: PersonRef }[];
  documents: TaskDocument[];
  permissions: {
    isParticipant: boolean;
    canManage: boolean;
    canApprove: boolean;
    canUpload: boolean;
    allowedTransitions: TaskStatus[];
  };
}

export interface Criterion {
  id: string;
  code: string;
  title: string;
  description: string | null;
  direction: string | null;
  parentId: string | null;
  tasks: {
    total: number;
    done: number;
    inReview: number;
    overdue: number;
    completionPct: number | null;
  };
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
