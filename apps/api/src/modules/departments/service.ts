import type { Request } from 'express';
import type { CreateDepartmentInput, UpdateDepartmentInput } from '@nwi/shared';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { prisma, type Db, type Prisma } from '../../lib/prisma';
import { recordAudit } from '../audit/service';

const departmentSelect = {
  id: true,
  name: true,
  code: true,
  parentId: true,
  createdAt: true,
  head: { select: { id: true, fullName: true } },
  _count: { select: { employees: true, children: true } },
} satisfies Prisma.DepartmentSelect;

type DepartmentRow = Prisma.DepartmentGetPayload<{ select: typeof departmentSelect }>;

function toDto({ _count, ...row }: DepartmentRow) {
  return { ...row, employeeCount: _count.employees, childCount: _count.children };
}

export async function listDepartments() {
  const rows = await prisma.department.findMany({
    select: departmentSelect,
    orderBy: { name: 'asc' },
  });
  return rows.map(toDto);
}

async function getDto(db: Db, id: string) {
  const row = await db.department.findUnique({ where: { id }, select: departmentSelect });
  if (!row) throw notFound('Bo‘lim');
  return toDto(row);
}

async function assertReferences(
  db: Db,
  input: UpdateDepartmentInput,
  selfId?: string,
): Promise<void> {
  if (input.headUserId) {
    const head = await db.user.findUnique({
      where: { id: input.headUserId },
      select: { isActive: true },
    });
    if (!head?.isActive)
      throw badRequest('Bo‘lim rahbari topilmadi yoki faol emas', 'HEAD_NOT_FOUND');
  }
  if (!input.parentId) return;
  if (input.parentId === selfId)
    throw badRequest('Bo‘lim o‘ziga bo‘ysuna olmaydi', 'DEPARTMENT_CYCLE');

  // Yuqoriga qarab yurib, tanlangan yuqori bo'lim shu bo'limning quyi bo'limi emasligini tekshiradi.
  const all = await db.department.findMany({ select: { id: true, parentId: true } });
  const parentOf = new Map(all.map((d) => [d.id, d.parentId]));
  if (!parentOf.has(input.parentId))
    throw badRequest('Yuqori bo‘lim topilmadi', 'PARENT_NOT_FOUND');
  for (let id: string | null | undefined = input.parentId; id; id = parentOf.get(id)) {
    if (id === selfId)
      throw badRequest('Bo‘limlar ierarxiyasida halqa hosil bo‘ladi', 'DEPARTMENT_CYCLE');
  }
}

export async function createDepartment(req: Request, input: CreateDepartmentInput) {
  return prisma.$transaction(async (tx) => {
    await assertReferences(tx, input);
    if (await tx.department.findUnique({ where: { code: input.code }, select: { id: true } })) {
      throw conflict('Bu kod bilan bo‘lim mavjud', 'DEPARTMENT_CODE_TAKEN');
    }
    const row = await tx.department.create({
      data: {
        name: input.name,
        code: input.code,
        parentId: input.parentId ?? null,
        headUserId: input.headUserId ?? null,
      },
      select: { id: true },
    });
    await recordAudit(
      req,
      { action: 'department.create', entityType: 'Department', entityId: row.id, diff: input },
      tx,
    );
    return getDto(tx, row.id);
  });
}

export async function updateDepartment(req: Request, id: string, input: UpdateDepartmentInput) {
  return prisma.$transaction(async (tx) => {
    if (!(await tx.department.findUnique({ where: { id }, select: { id: true } })))
      throw notFound('Bo‘lim');
    await assertReferences(tx, input, id);
    if (input.code) {
      const other = await tx.department.findUnique({
        where: { code: input.code },
        select: { id: true },
      });
      if (other && other.id !== id)
        throw conflict('Bu kod bilan bo‘lim mavjud', 'DEPARTMENT_CODE_TAKEN');
    }
    await tx.department.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.headUserId !== undefined ? { headUserId: input.headUserId } : {}),
      },
    });
    await recordAudit(
      req,
      { action: 'department.update', entityType: 'Department', entityId: id, diff: input },
      tx,
    );
    return getDto(tx, id);
  });
}

export async function deleteDepartment(req: Request, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const row = await tx.department.findUnique({
      where: { id },
      select: { code: true, _count: { select: { employees: true, children: true } } },
    });
    if (!row) throw notFound('Bo‘lim');
    if (row._count.employees > 0) {
      throw conflict(
        'Bo‘limda xodimlar bor. Avval ularni boshqa bo‘limga o‘tkazing',
        'DEPARTMENT_NOT_EMPTY',
      );
    }
    if (row._count.children > 0) {
      throw conflict('Bo‘limning quyi bo‘limlari bor', 'DEPARTMENT_HAS_CHILDREN');
    }
    await tx.department.delete({ where: { id } });
    await recordAudit(
      req,
      {
        action: 'department.delete',
        entityType: 'Department',
        entityId: id,
        diff: { code: row.code },
      },
      tx,
    );
  });
}
