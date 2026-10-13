import { Router } from 'express';
import { z } from 'zod';
import {
  createCriterionSchema,
  updateCriterionSchema,
  type TaskStatus,
  type UpdateCriterionInput,
} from '@nwi/shared';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { getAuth, requirePermission } from '../../middleware/auth';
import { recordAudit } from '../audit/service';
import { taskScopes, taskWhere } from '../tasks/access';
import { overdueWhere } from '../tasks/service';

export const accreditationRouter = Router();

const idParams = z.object({ id: z.uuid() });
const canManage = requirePermission('accreditation.manage');

// Mezonlar ro'yxati hammaga ochiq; topshiriqlar soni esa foydalanuvchi ko'ra oladigan topshiriqlar bo'yicha.
accreditationRouter.get(
  '/criteria',
  requirePermission('accreditation.view', 'accreditation.manage'),
  async (req, res) => {
    const scopes = await taskScopes(getAuth(req));
    const visible = taskWhere(scopes.view);
    const [criteria, byStatus, overdue] = await Promise.all([
      prisma.accreditationCriterion.findMany({
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          direction: true,
          parentId: true,
        },
      }),
      prisma.task.groupBy({
        by: ['criterionId', 'status'],
        where: { AND: [visible, { criterionId: { not: null } }] },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['criterionId'],
        where: { AND: [visible, { criterionId: { not: null } }, overdueWhere(new Date())] },
        _count: { _all: true },
      }),
    ]);
    const overdueById = new Map(overdue.map((o) => [o.criterionId, o._count._all]));
    res.json({
      items: criteria.map((criterion) => {
        const rows = byStatus.filter((r) => r.criterionId === criterion.id);
        const count = (...statuses: TaskStatus[]) =>
          rows
            .filter((r) => statuses.includes(r.status))
            .reduce((sum, r) => sum + r._count._all, 0);
        const total = rows.reduce((sum, r) => sum + r._count._all, 0) - count('CANCELLED');
        return {
          ...criterion,
          tasks: {
            total,
            done: count('DONE'),
            inReview: count('IN_REVIEW', 'APPROVED'),
            overdue: overdueById.get(criterion.id) ?? 0,
            // Topshiriq bo'lmasa foiz hisoblanmaydi.
            completionPct: total > 0 ? Math.round((count('DONE') / total) * 100) : null,
          },
        };
      }),
      canManage: getAuth(req).permissions.has('accreditation.manage'),
    });
  },
);

async function assertParent(
  db: Db,
  parentId: string | null | undefined,
  selfId?: string,
): Promise<void> {
  if (!parentId) return;
  if (parentId === selfId) throw badRequest('Mezon o‘ziga bo‘ysuna olmaydi', 'CRITERION_CYCLE');
  const all = await db.accreditationCriterion.findMany({ select: { id: true, parentId: true } });
  const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
  if (!parentOf.has(parentId)) throw badRequest('Yuqori mezon topilmadi', 'PARENT_NOT_FOUND');
  for (let id: string | null | undefined = parentId; id; id = parentOf.get(id)) {
    if (id === selfId)
      throw badRequest('Mezonlar ierarxiyasida halqa hosil bo‘ladi', 'CRITERION_CYCLE');
  }
}

async function assertCodeFree(db: Db, code: string, selfId?: string): Promise<void> {
  const other = await db.accreditationCriterion.findUnique({
    where: { code },
    select: { id: true },
  });
  if (other && other.id !== selfId)
    throw conflict('Bu kod bilan mezon mavjud', 'CRITERION_CODE_TAKEN');
}

accreditationRouter.post('/criteria', canManage, async (req, res) => {
  const input = parse(createCriterionSchema, req.body);
  const created = await prisma.$transaction(async (tx) => {
    await assertCodeFree(tx, input.code);
    await assertParent(tx, input.parentId);
    const row = await tx.accreditationCriterion.create({
      data: {
        code: input.code,
        title: input.title,
        description: input.description ?? null,
        direction: input.direction ?? null,
        parentId: input.parentId ?? null,
      },
    });
    await recordAudit(
      req,
      {
        action: 'criterion.create',
        entityType: 'AccreditationCriterion',
        entityId: row.id,
        diff: input,
      },
      tx,
    );
    return row;
  });
  res.status(201).json(created);
});

accreditationRouter.patch('/criteria/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  const input: UpdateCriterionInput = parse(updateCriterionSchema, req.body);
  const updated = await prisma.$transaction(async (tx) => {
    if (!(await tx.accreditationCriterion.findUnique({ where: { id }, select: { id: true } })))
      throw notFound('Mezon');
    if (input.code) await assertCodeFree(tx, input.code, id);
    await assertParent(tx, input.parentId, id);
    const row = await tx.accreditationCriterion.update({ where: { id }, data: { ...input } });
    await recordAudit(
      req,
      {
        action: 'criterion.update',
        entityType: 'AccreditationCriterion',
        entityId: id,
        diff: input,
      },
      tx,
    );
    return row;
  });
  res.json(updated);
});

accreditationRouter.delete('/criteria/:id', canManage, async (req, res) => {
  const { id } = parse(idParams, req.params);
  await prisma.$transaction(async (tx) => {
    const row = await tx.accreditationCriterion.findUnique({
      where: { id },
      select: { code: true, _count: { select: { tasks: true, children: true } } },
    });
    if (!row) throw notFound('Mezon');
    if (row._count.tasks > 0) throw conflict('Mezonga topshiriqlar bog‘langan', 'CRITERION_IN_USE');
    if (row._count.children > 0)
      throw conflict('Mezonning quyi mezonlari bor', 'CRITERION_HAS_CHILDREN');
    await tx.accreditationCriterion.delete({ where: { id } });
    await recordAudit(
      req,
      {
        action: 'criterion.delete',
        entityType: 'AccreditationCriterion',
        entityId: id,
        diff: { code: row.code },
      },
      tx,
    );
  });
  res.status(204).end();
});
