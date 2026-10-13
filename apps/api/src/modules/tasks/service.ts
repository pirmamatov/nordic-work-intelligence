import type { Request } from 'express';
import {
  CLOSED_TASK_STATUSES,
  TASK_TRANSITIONS,
  type ChangeTaskStatusInput,
  type CreateTaskInput,
  type TaskStatus,
  type UpdateTaskInput,
} from '@nwi/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { cursorArgs, toPage } from '../../lib/pagination';
import { prisma, type Db, type Prisma } from '../../lib/prisma';
import { recordAudit } from '../audit/service';
import type { AuthContext } from '../auth/context';
import { notifyEmployees } from '../notifications/service';
import {
  allowedTransitions,
  capabilitiesFor,
  taskScopes,
  taskWhere,
  type TaskScopes,
} from './access';

const STATUS_LABELS: Record<TaskStatus, string> = {
  NEW: 'Yangi',
  PLANNED: 'Rejalashtirilgan',
  IN_PROGRESS: 'Jarayonda',
  IN_REVIEW: 'Tekshiruvda',
  NEEDS_FIX: 'Tuzatish talab qilinadi',
  APPROVED: 'Tasdiqlangan',
  DONE: 'Bajarildi',
  DELAYED: 'Kechiktirilgan',
  CANCELLED: 'Bekor qilingan',
};

const person = {
  select: { id: true, user: { select: { fullName: true } }, departmentId: true },
} as const;

const listSelect = {
  id: true,
  title: true,
  direction: true,
  dueAt: true,
  priority: true,
  status: true,
  progressPct: true,
  completedAt: true,
  ownerId: true,
  owner: person,
  assignments: { select: { employeeId: true } },
  criterion: { select: { id: true, code: true, title: true } },
  _count: { select: { documents: true } },
} satisfies Prisma.TaskSelect;

type ListRow = Prisma.TaskGetPayload<{ select: typeof listSelect }>;

// "Muddati o'tgan" — alohida holat emas: muddat o'tgan, lekin natija hali tasdiqlanmagan topshiriq.
const OPEN_FOR_OVERDUE: TaskStatus[] = [
  'NEW',
  'PLANNED',
  'IN_PROGRESS',
  'IN_REVIEW',
  'NEEDS_FIX',
  'DELAYED',
];
export const overdueWhere = (now: Date): Prisma.TaskWhereInput => ({
  dueAt: { lt: now },
  status: { in: OPEN_FOR_OVERDUE },
});
const isOverdue = (task: { dueAt: Date; status: TaskStatus }, now = new Date()) =>
  task.dueAt < now && OPEN_FOR_OVERDUE.includes(task.status);

function toListDto({ assignments: _a, _count, owner, ...task }: ListRow) {
  return {
    ...task,
    owner: { id: owner.id, fullName: owner.user.fullName },
    documentCount: _count.documents,
    overdue: isOverdue(task),
  };
}

export interface ListTasksFilter {
  status?: TaskStatus | undefined;
  ownerId?: string | undefined;
  criterionId?: string | undefined;
  overdue?: boolean | undefined;
  q?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}

export async function listTasks(auth: AuthContext, filter: ListTasksFilter) {
  const scopes = await taskScopes(auth);
  const rows = await prisma.task.findMany({
    where: {
      AND: [
        taskWhere(scopes.view),
        filter.status ? { status: filter.status } : {},
        filter.ownerId ? { ownerId: filter.ownerId } : {},
        filter.criterionId ? { criterionId: filter.criterionId } : {},
        filter.overdue ? overdueWhere(new Date()) : {},
        filter.q ? { title: { contains: filter.q, mode: 'insensitive' } } : {},
      ],
    },
    select: listSelect,
    orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
    ...cursorArgs(filter),
  });
  const page = toPage(rows, filter.limit);
  return { ...page, items: page.items.map(toListDto), canCreate: scopes.manage !== null };
}

const detailInclude = {
  owner: person,
  criterion: { select: { id: true, code: true, title: true } },
  createdBy: { select: { id: true, fullName: true } },
  acceptedBy: { select: { id: true, fullName: true } },
  assignments: { select: { role: true, employeeId: true, employee: person } },
  statusHistory: {
    orderBy: { changedAt: 'asc' },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      comment: true,
      changedAt: true,
      changedBy: { select: { id: true, fullName: true } },
    },
  },
  comments: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, fullName: true } },
    },
  },
  documents: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      status: true,
      aiAssisted: true,
      qualityScore: true,
      reviewNote: true,
      reviewedAt: true,
      createdAt: true,
      createdBy: { select: { id: true, fullName: true } },
      reviewer: { select: { id: true, fullName: true } },
      versions: {
        orderBy: { versionNo: 'desc' },
        select: {
          id: true,
          versionNo: true,
          fileName: true,
          sizeBytes: true,
          sha256: true,
          note: true,
          createdAt: true,
          uploadedBy: { select: { id: true, fullName: true } },
        },
      },
    },
  },
} satisfies Prisma.TaskInclude;

type DetailRow = Prisma.TaskGetPayload<{ include: typeof detailInclude }>;

/** Topshiriqni ko'rish doirasi bilan yuklaydi; doiradan tashqarida bo'lsa "topilmadi". */
export async function loadTask(
  auth: AuthContext,
  id: string,
  db: Db = prisma,
  scopes?: TaskScopes,
) {
  const resolved = scopes ?? (await taskScopes(auth));
  const task = await db.task.findFirst({
    where: { AND: [{ id }, taskWhere(resolved.view)] },
    include: detailInclude,
  });
  if (!task) throw notFound('Topshiriq');
  return { task, scopes: resolved, caps: capabilitiesFor(auth, resolved, task) };
}

function toDetailDto(auth: AuthContext, scopes: TaskScopes, task: DetailRow) {
  const caps = capabilitiesFor(auth, scopes, task);
  const { owner, assignments, ...rest } = task;
  return {
    ...rest,
    owner: { id: owner.id, fullName: owner.user.fullName },
    collaborators: assignments
      .filter((a) => a.role === 'COLLABORATOR')
      .map((a) => ({ id: a.employee.id, fullName: a.employee.user.fullName })),
    overdue: isOverdue(task),
    permissions: {
      ...caps,
      canUpload:
        (caps.isParticipant || caps.canManage) && !CLOSED_TASK_STATUSES.includes(task.status),
      allowedTransitions: allowedTransitions(task.status, caps),
    },
  };
}

export async function getTask(auth: AuthContext, id: string) {
  const { task, scopes } = await loadTask(auth, id);
  return toDetailDto(auth, scopes, task);
}

/** Yangi mas'ul yoki ishtirokchi boshqaruvchining doirasida bo'lishi kerak. */
async function assertEmployeesManageable(
  db: Db,
  scopes: TaskScopes,
  employeeIds: string[],
): Promise<void> {
  const ids = [...new Set(employeeIds)];
  const employees = await db.employeeProfile.findMany({
    where: { id: { in: ids }, isActive: true, user: { isActive: true } },
    select: { id: true, departmentId: true },
  });
  if (employees.length !== ids.length)
    throw badRequest('Xodim topilmadi yoki faol emas', 'EMPLOYEE_NOT_FOUND');
  const manage = scopes.manage;
  if (!manage) throw forbidden();
  if (manage.all) return;
  for (const e of employees) {
    if (!e.departmentId || !manage.departmentIds.includes(e.departmentId)) {
      throw forbidden('FORBIDDEN', 'Faqat o‘z bo‘limingiz xodimlariga topshiriq bera olasiz');
    }
  }
}

async function assertCriterion(db: Db, criterionId: string | null | undefined): Promise<void> {
  if (!criterionId) return;
  if (
    !(await db.accreditationCriterion.findUnique({
      where: { id: criterionId },
      select: { id: true },
    }))
  ) {
    throw badRequest('Akkreditatsiya mezoni topilmadi', 'CRITERION_NOT_FOUND');
  }
}

async function setAssignments(
  db: Db,
  taskId: string,
  ownerId: string,
  collaboratorIds: string[],
): Promise<void> {
  await db.taskAssignment.deleteMany({ where: { taskId } });
  await db.taskAssignment.createMany({
    data: [
      { taskId, employeeId: ownerId, role: 'OWNER' as const },
      ...[...new Set(collaboratorIds)]
        .filter((id) => id !== ownerId)
        .map((employeeId) => ({ taskId, employeeId, role: 'COLLABORATOR' as const })),
    ],
  });
}

export async function createTask(req: Request, auth: AuthContext, input: CreateTaskInput) {
  const scopes = await taskScopes(auth);
  if (!scopes.manage) throw forbidden();
  const id = await prisma.$transaction(async (tx) => {
    await assertEmployeesManageable(tx, scopes, [input.ownerId, ...input.collaboratorIds]);
    await assertCriterion(tx, input.criterionId);
    const task = await tx.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        direction: input.direction ?? null,
        criterionId: input.criterionId ?? null,
        ownerId: input.ownerId,
        createdById: auth.userId,
        dueAt: new Date(input.dueAt),
        priority: input.priority,
        expectedResult: input.expectedResult ?? null,
      },
      select: { id: true },
    });
    await setAssignments(tx, task.id, input.ownerId, input.collaboratorIds);
    await tx.taskStatusHistory.create({
      data: { taskId: task.id, toStatus: 'NEW', changedById: auth.userId },
    });
    await notifyEmployees(
      tx,
      [input.ownerId, ...input.collaboratorIds],
      {
        type: 'task.assigned',
        title: 'Sizga topshiriq biriktirildi',
        body: input.title,
        link: `/topshiriqlar/${task.id}`,
      },
      auth.userId,
    );
    await recordAudit(
      req,
      { action: 'task.create', entityType: 'Task', entityId: task.id, diff: input },
      tx,
    );
    return task.id;
  });
  // Yaratuvchi topshiriqni ko'rish doirasida bo'lmasligi mumkin emas: boshqarish doirasi ko'rishnikidan keng emas.
  return getTask(auth, id);
}

export async function updateTask(
  req: Request,
  auth: AuthContext,
  id: string,
  input: UpdateTaskInput,
) {
  await prisma.$transaction(async (tx) => {
    const { task, scopes, caps } = await loadTask(auth, id, tx);
    if (CLOSED_TASK_STATUSES.includes(task.status))
      throw conflict('Yakunlangan topshiriq o‘zgartirilmaydi', 'TASK_CLOSED');
    const { progressPct, ...managed } = input;
    const changesManaged = Object.keys(managed).length > 0;
    // Ishtirokchi faqat bajarilish foizini yangilaydi; qolgan maydonlar — boshqaruvchiniki.
    if (changesManaged && !caps.canManage) throw forbidden();
    if (!caps.canManage && !caps.isParticipant) throw forbidden();

    const ownerId = managed.ownerId ?? task.ownerId;
    if (managed.ownerId !== undefined || managed.collaboratorIds !== undefined) {
      const collaborators =
        managed.collaboratorIds ??
        task.assignments.filter((a) => a.role === 'COLLABORATOR').map((a) => a.employeeId);
      await assertEmployeesManageable(tx, scopes, [ownerId, ...collaborators]);
      await setAssignments(tx, id, ownerId, collaborators);
      await notifyEmployees(
        tx,
        [ownerId, ...collaborators].filter(
          (e) => !task.assignments.some((a) => a.employeeId === e),
        ),
        {
          type: 'task.assigned',
          title: 'Sizga topshiriq biriktirildi',
          body: task.title,
          link: `/topshiriqlar/${id}`,
        },
        auth.userId,
      );
    }
    if (managed.criterionId !== undefined) await assertCriterion(tx, managed.criterionId);

    await tx.task.update({
      where: { id },
      data: {
        ...(managed.title !== undefined ? { title: managed.title } : {}),
        ...(managed.description !== undefined ? { description: managed.description } : {}),
        ...(managed.direction !== undefined ? { direction: managed.direction } : {}),
        ...(managed.criterionId !== undefined ? { criterionId: managed.criterionId } : {}),
        ...(managed.ownerId !== undefined ? { ownerId } : {}),
        ...(managed.dueAt !== undefined ? { dueAt: new Date(managed.dueAt) } : {}),
        ...(managed.priority !== undefined ? { priority: managed.priority } : {}),
        ...(managed.expectedResult !== undefined ? { expectedResult: managed.expectedResult } : {}),
        ...(progressPct !== undefined ? { progressPct } : {}),
      },
    });
    await recordAudit(
      req,
      { action: 'task.update', entityType: 'Task', entityId: id, diff: input },
      tx,
    );
  });
  return getTask(auth, id);
}

export async function changeStatus(
  req: Request,
  auth: AuthContext,
  id: string,
  input: ChangeTaskStatusInput,
) {
  await prisma.$transaction(async (tx) => {
    const { task, caps } = await loadTask(auth, id, tx);
    const from = task.status;
    const to = input.status;
    if (!TASK_TRANSITIONS[from].includes(to)) {
      throw conflict(
        `“${STATUS_LABELS[from]}” holatidan “${STATUS_LABELS[to]}” holatiga o‘tib bo‘lmaydi`,
        'INVALID_TRANSITION',
      );
    }
    if (!allowedTransitions(from, caps).includes(to)) {
      throw forbidden(
        'TRANSITION_FORBIDDEN',
        to === 'APPROVED' || to === 'DONE'
          ? 'Natijani faqat vakolatli shaxs tasdiqlaydi; mas’ul xodim o‘z topshirig‘ini tasdiqlay olmaydi'
          : 'Bu holatga o‘tkazish uchun ruxsat yo‘q',
      );
    }
    if (to === 'DELAYED' && !input.delayReason)
      throw badRequest('Kechikish sababini kiriting', 'DELAY_REASON_REQUIRED');
    if (to === 'NEEDS_FIX' && !input.comment)
      throw badRequest('Nimani tuzatish kerakligini yozing', 'COMMENT_REQUIRED');
    if (to === 'DONE') {
      // Kompyuterdagi faollik emas, tasdiqlangan natija kerak: hujjat yoki qabul qilish izohi.
      const approvedDocs = task.documents.filter((d) => d.status === 'APPROVED').length;
      if (approvedDocs === 0 && !input.comment) {
        throw badRequest(
          'Tasdiqlangan hujjat yo‘q. Natija qanday qabul qilinganini izohda yozing',
          'RESULT_EVIDENCE_REQUIRED',
        );
      }
    }

    const now = new Date();
    // Holat shu orada boshqa so'rov bilan o'zgargan bo'lsa, yangilanish bajarilmaydi.
    const updated = await tx.task.updateMany({
      where: { id, status: from },
      data: {
        status: to,
        ...(to === 'DELAYED' ? { delayReason: input.delayReason ?? null } : {}),
        ...(to === 'APPROVED' ? { acceptedById: auth.userId, acceptedAt: now } : {}),
        ...(to === 'NEEDS_FIX' ? { acceptedById: null, acceptedAt: null } : {}),
        ...(to === 'DONE' ? { completedAt: now, progressPct: 100 } : {}),
      },
    });
    if (updated.count !== 1)
      throw conflict('Topshiriq holati o‘zgargan. Sahifani yangilang', 'STALE_STATUS');

    const comment =
      to === 'DELAYED'
        ? [input.delayReason, input.comment].filter(Boolean).join(' — ')
        : (input.comment ?? null);
    await tx.taskStatusHistory.create({
      data: {
        taskId: id,
        fromStatus: from,
        toStatus: to,
        changedById: auth.userId,
        comment: comment || null,
      },
    });
    await notifyEmployees(
      tx,
      task.assignments.map((a) => a.employeeId),
      {
        type: 'task.status',
        title: `Topshiriq holati: ${STATUS_LABELS[to]}`,
        body: task.title,
        link: `/topshiriqlar/${id}`,
      },
      auth.userId,
    );
    await recordAudit(
      req,
      { action: 'task.status', entityType: 'Task', entityId: id, diff: { from, to } },
      tx,
    );
  });
  return getTask(auth, id);
}

export async function addComment(req: Request, auth: AuthContext, id: string, body: string) {
  await prisma.$transaction(async (tx) => {
    const { task } = await loadTask(auth, id, tx);
    await tx.taskComment.create({ data: { taskId: id, authorId: auth.userId, body } });
    await notifyEmployees(
      tx,
      task.assignments.map((a) => a.employeeId),
      {
        type: 'task.comment',
        title: 'Topshiriqqa izoh qo‘shildi',
        body: task.title,
        link: `/topshiriqlar/${id}`,
      },
      auth.userId,
    );
  });
  return getTask(auth, id);
}

/** Dashboard uchun: ko'rish doirasidagi topshiriqlar bo'yicha yig'ma. */
export async function taskStats(auth: AuthContext) {
  const scopes = await taskScopes(auth);
  const where = taskWhere(scopes.view);
  const now = new Date();
  const [byStatus, overdue] = await Promise.all([
    prisma.task.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.task.count({ where: { AND: [where, overdueWhere(now)] } }),
  ]);
  const count = (status: TaskStatus) => byStatus.find((s) => s.status === status)?._count._all ?? 0;
  const total = byStatus.reduce((sum, s) => sum + s._count._all, 0);
  const active = total - count('CANCELLED');
  return {
    total,
    done: count('DONE'),
    inReview: count('IN_REVIEW'),
    overdue,
    // Bekor qilinganlar hisobga olinmaydi. Topshiriq bo'lmasa foiz hisoblanmaydi (null).
    completionPct: active > 0 ? Math.round((count('DONE') / active) * 100) : null,
  };
}
