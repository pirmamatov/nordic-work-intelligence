import type { Request } from 'express';
import type { CreateUserInput, UpdateUserInput } from '@nwi/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { cursorArgs, toPage } from '../../lib/pagination';
import { hashPassword, passwordProblem } from '../../lib/password';
import { prisma, type Db, type Prisma } from '../../lib/prisma';
import { recordAudit } from '../audit/service';
import type { AuthContext } from '../auth/context';
import { PERMISSIONS, type PermissionCode, type RoleCode } from '../rbac/catalog';
import { employeeWhere, resolveScope } from '../rbac/scope';

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  isActive: true,
  mustChangePassword: true,
  mfaEnabledAt: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { code: true, name: true } } } },
  permissions: { select: { permission: { select: { code: true } } } },
  employee: {
    select: {
      id: true,
      position: true,
      employeeNumber: true,
      hiredAt: true,
      isActive: true,
      monitoringConsentAt: true,
      department: { select: { id: true, name: true, code: true } },
    },
  },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toDto(row: UserRow) {
  const { mfaEnabledAt, roles, permissions, employee, ...rest } = row;
  return {
    ...rest,
    mfaEnabled: mfaEnabledAt !== null,
    roles: roles.map((r) => r.role.code),
    extraPermissions: permissions.map((p) => p.permission.code),
    employee: employee && {
      ...employee,
      hiredAt: employee.hiredAt?.toISOString().slice(0, 10) ?? null,
    },
  };
}

/** Doira bo'yicha foydalanuvchi sharti. To'liq doirada xodim profili yo'q hisoblar ham ko'rinadi. */
async function visibleUsers(auth: AuthContext): Promise<Prisma.UserWhereInput> {
  const scope = await resolveScope(auth, 'employees.view');
  return scope.all ? {} : { employee: employeeWhere(scope) };
}

export interface ListUsersFilter {
  q?: string | undefined;
  departmentId?: string | undefined;
  role?: RoleCode | undefined;
  isActive?: boolean | undefined;
  limit: number;
  cursor?: string | undefined;
}

export async function listUsers(auth: AuthContext, filter: ListUsersFilter) {
  const where: Prisma.UserWhereInput = {
    AND: [
      await visibleUsers(auth),
      filter.q
        ? {
            OR: [
              { fullName: { contains: filter.q, mode: 'insensitive' } },
              { email: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {},
      filter.departmentId ? { employee: { departmentId: filter.departmentId } } : {},
      filter.role ? { roles: { some: { role: { code: filter.role } } } } : {},
      filter.isActive !== undefined ? { isActive: filter.isActive } : {},
    ],
  };
  const rows = await prisma.user.findMany({
    where,
    select: userSelect,
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    ...cursorArgs(filter),
  });
  const page = toPage(rows, filter.limit);
  return { ...page, items: page.items.map(toDto) };
}

// Doiradan tashqaridagi yozuv "topilmadi" bo'lib ko'rinadi — mavjudligi oshkor qilinmaydi.
export async function getUser(auth: AuthContext, id: string) {
  const row = await prisma.user.findFirst({
    where: { AND: [{ id }, await visibleUsers(auth)] },
    select: userSelect,
  });
  if (!row) throw notFound('Foydalanuvchi');
  return toDto(row);
}

function assertMayAssignRoles(auth: AuthContext, roles: RoleCode[]): void {
  if (roles.includes('SUPER_ADMIN') && !auth.permissions.has('roles.manage')) {
    throw forbidden('FORBIDDEN', 'Super administrator rolini biriktirish uchun ruxsat yo‘q');
  }
}

async function assertDepartmentExists(
  db: Db,
  departmentId: string | null | undefined,
): Promise<void> {
  if (!departmentId) return;
  const found = await db.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!found) throw badRequest('Bo‘lim topilmadi', 'DEPARTMENT_NOT_FOUND');
}

async function setRoles(db: Db, userId: string, roles: RoleCode[]): Promise<void> {
  const rows = await db.role.findMany({ where: { code: { in: roles } }, select: { id: true } });
  if (rows.length !== new Set(roles).size) throw badRequest('Rol topilmadi', 'ROLE_NOT_FOUND');
  await db.userRole.deleteMany({ where: { userId } });
  await db.userRole.createMany({ data: rows.map((r) => ({ userId, roleId: r.id })) });
}

function employeeData(input: NonNullable<UpdateUserInput['employee']>) {
  return {
    ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
    ...(input.position !== undefined ? { position: input.position } : {}),
    ...(input.employeeNumber !== undefined ? { employeeNumber: input.employeeNumber } : {}),
    ...(input.hiredAt !== undefined
      ? { hiredAt: input.hiredAt ? new Date(input.hiredAt) : null }
      : {}),
  };
}

export async function createUser(req: Request, auth: AuthContext, input: CreateUserInput) {
  assertMayAssignRoles(auth, input.roles);
  const problem = passwordProblem(input.password, input);
  if (problem) throw badRequest(problem, 'WEAK_PASSWORD');
  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw conflict('Bu elektron pochta bilan foydalanuvchi mavjud', 'EMAIL_TAKEN');
  }
  const passwordHash = await hashPassword(input.password);

  const id = await prisma.$transaction(async (tx) => {
    await assertDepartmentExists(tx, input.employee?.departmentId);
    const user = await tx.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        passwordHash,
        // Administrator bergan parol vaqtinchalik: birinchi kirishda almashtiriladi.
        mustChangePassword: true,
        ...(input.employee ? { employee: { create: employeeData(input.employee) } } : {}),
      },
      select: { id: true },
    });
    await setRoles(tx, user.id, input.roles);
    await recordAudit(
      req,
      {
        action: 'user.create',
        entityType: 'User',
        entityId: user.id,
        diff: {
          email: input.email,
          roles: input.roles,
          departmentId: input.employee?.departmentId ?? null,
        },
      },
      tx,
    );
    return user.id;
  });
  return getUser(auth, id);
}

export async function updateUser(
  req: Request,
  auth: AuthContext,
  id: string,
  input: UpdateUserInput,
) {
  const existing = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      employee: { select: { id: true } },
      roles: { select: { role: { select: { code: true } } } },
    },
  });
  if (!existing) throw notFound('Foydalanuvchi');

  const currentRoles = existing.roles.map((r) => r.role.code);
  if (input.roles) {
    assertMayAssignRoles(auth, input.roles);
    if (currentRoles.includes('SUPER_ADMIN') && !auth.permissions.has('roles.manage'))
      throw forbidden();
  }
  // Administrator o'zini tizimdan chiqarib qo'ymasligi uchun.
  if (id === auth.userId) {
    if (input.isActive === false)
      throw badRequest('O‘z hisobingizni o‘chira olmaysiz', 'SELF_DEACTIVATION');
    if (
      input.roles &&
      currentRoles.includes('SUPER_ADMIN') &&
      !input.roles.includes('SUPER_ADMIN')
    ) {
      throw badRequest(
        'O‘zingizdan super administrator rolini olib tashlay olmaysiz',
        'SELF_DEMOTION',
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await assertDepartmentExists(tx, input.employee?.departmentId);
    await tx.user.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.employee
          ? {
              employee: {
                upsert: {
                  create: employeeData(input.employee),
                  update: employeeData(input.employee),
                },
              },
            }
          : {}),
      },
    });
    if (input.roles) await setRoles(tx, id, input.roles);
    if (input.isActive === false) {
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await recordAudit(
      req,
      { action: 'user.update', entityType: 'User', entityId: id, diff: input },
      tx,
    );
  });
  return getUser(auth, id);
}

export async function resetPassword(req: Request, id: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, fullName: true },
  });
  if (!user) throw notFound('Foydalanuvchi');
  const problem = passwordProblem(newPassword, user);
  if (problem) throw badRequest(problem, 'WEAK_PASSWORD');
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await tx.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit(req, { action: 'user.password.reset', entityType: 'User', entityId: id }, tx);
  });
}

export async function resetMfa(req: Request, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.user.updateMany({
      where: { id },
      data: { mfaSecretEnc: null, mfaEnabledAt: null, mfaLastUsedStep: null },
    });
    if (result.count === 0) throw notFound('Foydalanuvchi');
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: id } });
    await tx.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit(req, { action: 'user.mfa.reset', entityType: 'User', entityId: id }, tx);
  });
}

export async function revokeSessions(req: Request, id: string): Promise<number> {
  if (!(await prisma.user.findUnique({ where: { id }, select: { id: true } })))
    throw notFound('Foydalanuvchi');
  const result = await prisma.session.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await recordAudit(req, {
    action: 'user.sessions.revoke',
    entityType: 'User',
    entityId: id,
    diff: { revoked: result.count },
  });
  return result.count;
}

/** Roldan tashqari alohida ruxsatlarni (masalan `screenshots.view`) to'liq almashtiradi. */
export async function setExtraPermissions(
  req: Request,
  auth: AuthContext,
  id: string,
  codes: PermissionCode[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (!(await tx.user.findUnique({ where: { id }, select: { id: true } })))
      throw notFound('Foydalanuvchi');
    const permissions = await tx.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true },
    });
    await tx.userPermission.deleteMany({ where: { userId: id } });
    await tx.userPermission.createMany({
      data: permissions.map((p) => ({ userId: id, permissionId: p.id, grantedById: auth.userId })),
    });
    await recordAudit(
      req,
      {
        action: 'user.permissions.set',
        entityType: 'User',
        entityId: id,
        diff: { permissions: codes },
      },
      tx,
    );
  });
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    select: {
      code: true,
      name: true,
      requiresMfa: true,
      isSystem: true,
      permissions: { select: { permission: { select: { code: true } } } },
    },
  });
  return {
    roles: roles.map(({ permissions, ...role }) => ({
      ...role,
      permissions: permissions.map((p) => p.permission.code).sort(),
    })),
    permissions: Object.entries(PERMISSIONS).map(([code, def]) => ({
      code,
      description: def.description,
    })),
  };
}
