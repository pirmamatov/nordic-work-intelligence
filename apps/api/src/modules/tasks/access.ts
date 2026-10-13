import type { TaskStatus } from '@nwi/shared';
import { AppError } from '../../lib/errors';
import type { Prisma } from '../../lib/prisma';
import type { AuthContext } from '../auth/context';
import { resolveScope, type Scope } from '../rbac/scope';

/** Ruxsat bo'lmasa xato o'rniga null qaytaradi. */
async function tryScope(auth: AuthContext, base: string): Promise<Scope | null> {
  try {
    return await resolveScope(auth, base);
  } catch (error) {
    if (error instanceof AppError && error.status === 403) return null;
    throw error;
  }
}

export interface TaskScopes {
  view: Scope;
  manage: Scope | null;
  approve: Scope | null;
}

export async function taskScopes(auth: AuthContext): Promise<TaskScopes> {
  const [view, manage, approve] = await Promise.all([
    resolveScope(auth, 'tasks.view'),
    tryScope(auth, 'tasks.manage'),
    tryScope(auth, 'tasks.approve'),
  ]);
  return { view, manage, approve };
}

/** Doiraga mos topshiriqlar: bo'lim doirasi mas'ul xodimning bo'limi bo'yicha, shaxsiy doira ishtirok bo'yicha. */
export function taskWhere(scope: Scope): Prisma.TaskWhereInput {
  if (scope.all) return {};
  const or: Prisma.TaskWhereInput[] = [];
  if (scope.departmentIds.length > 0)
    or.push({ owner: { departmentId: { in: scope.departmentIds } } });
  if (scope.employeeId) {
    or.push(
      { ownerId: scope.employeeId },
      { assignments: { some: { employeeId: scope.employeeId } } },
    );
  }
  return or.length > 0 ? { OR: or } : { id: { in: [] } };
}

function covers(scope: Scope | null, ownerDepartmentId: string | null): boolean {
  if (!scope) return false;
  return (
    scope.all || (ownerDepartmentId !== null && scope.departmentIds.includes(ownerDepartmentId))
  );
}

export interface TaskCapabilities {
  isParticipant: boolean;
  canManage: boolean;
  /** Tasdiqlovchi mas'ul xodimning o'zi bo'lishi mumkin emas. */
  canApprove: boolean;
}

export function capabilitiesFor(
  auth: AuthContext,
  scopes: TaskScopes,
  task: {
    ownerId: string;
    owner: { departmentId: string | null };
    assignments: { employeeId: string }[];
  },
): TaskCapabilities {
  const isOwner = auth.employeeId !== null && task.ownerId === auth.employeeId;
  const isParticipant = isOwner || task.assignments.some((a) => a.employeeId === auth.employeeId);
  return {
    isParticipant,
    canManage: covers(scopes.manage, task.owner.departmentId),
    canApprove: covers(scopes.approve, task.owner.departmentId) && !isOwner,
  };
}

const PARTICIPANT_MOVES: Partial<Record<TaskStatus, TaskStatus[]>> = {
  NEW: ['IN_PROGRESS'],
  PLANNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['IN_REVIEW', 'DELAYED'],
  DELAYED: ['IN_PROGRESS', 'IN_REVIEW'],
  NEEDS_FIX: ['IN_PROGRESS', 'IN_REVIEW'],
};
const APPROVER_MOVES: Partial<Record<TaskStatus, TaskStatus[]>> = {
  IN_REVIEW: ['APPROVED', 'NEEDS_FIX'],
  APPROVED: ['DONE', 'NEEDS_FIX'],
};
const MANAGER_ONLY_MOVES: Partial<Record<TaskStatus, TaskStatus[]>> = {
  NEW: ['PLANNED', 'CANCELLED'],
  PLANNED: ['CANCELLED'],
  IN_PROGRESS: ['CANCELLED'],
  DELAYED: ['CANCELLED'],
  IN_REVIEW: ['CANCELLED'],
  NEEDS_FIX: ['CANCELLED'],
};

/** Shu foydalanuvchi joriy holatdan qaysi holatlarga o'tkaza oladi. */
export function allowedTransitions(status: TaskStatus, caps: TaskCapabilities): TaskStatus[] {
  const allowed = new Set<TaskStatus>();
  if (caps.isParticipant || caps.canManage)
    for (const s of PARTICIPANT_MOVES[status] ?? []) allowed.add(s);
  if (caps.canManage) for (const s of MANAGER_ONLY_MOVES[status] ?? []) allowed.add(s);
  if (caps.canApprove) for (const s of APPROVER_MOVES[status] ?? []) allowed.add(s);
  return [...allowed];
}
