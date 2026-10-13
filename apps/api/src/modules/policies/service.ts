import type { Request } from 'express';
import type {
  AssignPolicyInput,
  CreatePolicyInput,
  UpdatePolicyInput,
  WorkSchedule,
} from '@nwi/shared';
import { env } from '../../config/env';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { prisma, type Db } from '../../lib/prisma';
import { recordAudit } from '../audit/service';

export interface EffectivePolicy {
  id: string | null;
  name: string;
  version: number;
  workSchedule: WorkSchedule;
  timezone: string;
  idleThresholdSec: number;
  screenshotsEnabled: boolean;
  screenshotIntervalSec: number;
  excludedProcesses: string[];
  allowedDomains: string[];
}

/** Hech qanday siyosat sozlanmaganda qo'llanadigan qiymatlar. Ekran tasvirlari o'chirilgan. */
export function builtinPolicy(): EffectivePolicy {
  return {
    id: null,
    name: 'Standart siyosat',
    version: 0,
    workSchedule: { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' },
    timezone: env.ORG_TIMEZONE,
    idleThresholdSec: 300,
    screenshotsEnabled: false,
    screenshotIntervalSec: 600,
    excludedProcesses: [],
    allowedDomains: [],
  };
}

/** Aniqlik tartibi: xodimga biriktirilgan → bo'limiga biriktirilgan → sukut bo'yicha → ichki standart. */
export async function effectivePolicy(
  employeeId: string,
  db: Db = prisma,
): Promise<EffectivePolicy> {
  const employee = await db.employeeProfile.findUnique({
    where: { id: employeeId },
    select: { departmentId: true },
  });
  const assignment =
    (await db.policyAssignment.findUnique({ where: { employeeId }, select: { policy: true } })) ??
    (employee?.departmentId
      ? await db.policyAssignment.findUnique({
          where: { departmentId: employee.departmentId },
          select: { policy: true },
        })
      : null);
  const policy =
    assignment?.policy ?? (await db.monitoringPolicy.findFirst({ where: { isDefault: true } }));
  if (!policy) return builtinPolicy();
  return {
    id: policy.id,
    name: policy.name,
    version: policy.version,
    workSchedule: policy.workSchedule as unknown as WorkSchedule,
    timezone: policy.timezone,
    idleThresholdSec: policy.idleThresholdSec,
    screenshotsEnabled: policy.screenshotsEnabled,
    screenshotIntervalSec: policy.screenshotIntervalSec,
    excludedProcesses: policy.excludedProcesses,
    allowedDomains: policy.allowedDomains,
  };
}

const policyInclude = {
  assignments: {
    select: {
      department: { select: { id: true, name: true } },
      employee: { select: { id: true, user: { select: { fullName: true } } } },
    },
  },
} as const;

export async function listPolicies() {
  return prisma.monitoringPolicy.findMany({ orderBy: { name: 'asc' }, include: policyInclude });
}

async function assertNameFree(db: Db, name: string, selfId?: string): Promise<void> {
  const other = await db.monitoringPolicy.findUnique({ where: { name }, select: { id: true } });
  if (other && other.id !== selfId)
    throw conflict('Bu nom bilan siyosat mavjud', 'POLICY_NAME_TAKEN');
}

export async function createPolicy(req: Request, input: CreatePolicyInput) {
  return prisma.$transaction(async (tx) => {
    await assertNameFree(tx, input.name);
    if (input.isDefault)
      await tx.monitoringPolicy.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    const policy = await tx.monitoringPolicy.create({ data: input, include: policyInclude });
    await recordAudit(
      req,
      { action: 'policy.create', entityType: 'MonitoringPolicy', entityId: policy.id, diff: input },
      tx,
    );
    return policy;
  });
}

export async function updatePolicy(req: Request, id: string, input: UpdatePolicyInput) {
  return prisma.$transaction(async (tx) => {
    if (!(await tx.monitoringPolicy.findUnique({ where: { id }, select: { id: true } })))
      throw notFound('Siyosat');
    if (input.name) await assertNameFree(tx, input.name, id);
    if (input.isDefault) {
      await tx.monitoringPolicy.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    const data = { ...input };
    // Har bir o'zgarish versiyani oshiradi — agentlar yangi konfiguratsiyani shundan biladi.
    const policy = await tx.monitoringPolicy.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
      include: policyInclude,
    });
    await recordAudit(
      req,
      { action: 'policy.update', entityType: 'MonitoringPolicy', entityId: id, diff: input },
      tx,
    );
    return policy;
  });
}

export async function deletePolicy(req: Request, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const policy = await tx.monitoringPolicy.findUnique({
      where: { id },
      select: { name: true, _count: { select: { assignments: true } } },
    });
    if (!policy) throw notFound('Siyosat');
    if (policy._count.assignments > 0) {
      throw conflict(
        'Siyosat bo‘lim yoki xodimlarga biriktirilgan. Avval biriktirishni olib tashlang',
        'POLICY_IN_USE',
      );
    }
    await tx.monitoringPolicy.delete({ where: { id } });
    await recordAudit(
      req,
      {
        action: 'policy.delete',
        entityType: 'MonitoringPolicy',
        entityId: id,
        diff: { name: policy.name },
      },
      tx,
    );
  });
}

export async function assignPolicy(req: Request, input: AssignPolicyInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = input.departmentId
      ? { departmentId: input.departmentId }
      : { employeeId: input.employeeId ?? '' };
    const exists = input.departmentId
      ? await tx.department.findUnique({ where: { id: input.departmentId }, select: { id: true } })
      : await tx.employeeProfile.findUnique({
          where: { id: input.employeeId ?? '' },
          select: { id: true },
        });
    if (!exists) throw badRequest('Bo‘lim yoki xodim topilmadi', 'TARGET_NOT_FOUND');

    if (input.policyId === null) {
      await tx.policyAssignment.deleteMany({ where: target });
    } else {
      if (
        !(await tx.monitoringPolicy.findUnique({
          where: { id: input.policyId },
          select: { id: true },
        }))
      ) {
        throw badRequest('Siyosat topilmadi', 'POLICY_NOT_FOUND');
      }
      await tx.policyAssignment.upsert({
        where: target,
        create: { ...target, policyId: input.policyId },
        update: { policyId: input.policyId },
      });
    }
    await recordAudit(
      req,
      { action: 'policy.assign', entityType: 'MonitoringPolicy', diff: input },
      tx,
    );
  });
}
