import { forbidden } from '../../lib/errors';
import { prisma, type Prisma } from '../../lib/prisma';
import type { AuthContext } from '../auth/context';

/**
 * Foydalanuvchi kimning ma'lumotini ko'ra olishi. `all` bo'lmasa, bo'limlar va
 * o'zining yozuvi birlashtiriladi (bo'lim rahbari o'z bo'limi + o'zi).
 */
export interface Scope {
  all: boolean;
  departmentIds: string[];
  employeeId: string | null;
}

async function headedDepartmentIds(userId: string): Promise<string[]> {
  const departments = await prisma.department.findMany({
    select: { id: true, parentId: true, headUserId: true },
  });
  const children = new Map<string, string[]>();
  for (const d of departments) {
    if (!d.parentId) continue;
    children.set(d.parentId, [...(children.get(d.parentId) ?? []), d.id]);
  }
  // Rahbarlik quyi bo'limlarga ham tarqaladi.
  const result = new Set<string>();
  const queue = departments.filter((d) => d.headUserId === userId).map((d) => d.id);
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return [...result];
}

/**
 * `base` — ruxsat asosi, masalan `activity.view`: `.all`, `.department`, `.self`
 * qo'shimchalari tekshiriladi. Hech biri bo'lmasa 403.
 */
export async function resolveScope(auth: AuthContext, base: string): Promise<Scope> {
  if (auth.permissions.has(`${base}.all`))
    return { all: true, departmentIds: [], employeeId: null };
  const departmentIds = auth.permissions.has(`${base}.department`)
    ? await headedDepartmentIds(auth.userId)
    : [];
  const employeeId = auth.permissions.has(`${base}.self`) ? auth.employeeId : null;
  if (!auth.permissions.has(`${base}.department`) && !auth.permissions.has(`${base}.self`)) {
    throw forbidden();
  }
  return { all: false, departmentIds, employeeId };
}

/** Doiraga mos xodimlar sharti. Bo'sh doira hech narsaga mos kelmaydi. */
export function employeeWhere(scope: Scope): Prisma.EmployeeProfileWhereInput {
  if (scope.all) return {};
  const or: Prisma.EmployeeProfileWhereInput[] = [];
  if (scope.departmentIds.length > 0) or.push({ departmentId: { in: scope.departmentIds } });
  if (scope.employeeId) or.push({ id: scope.employeeId });
  return or.length > 0 ? { OR: or } : { id: { in: [] } };
}

export async function employeeInScope(scope: Scope, employeeId: string): Promise<boolean> {
  if (scope.all) return true;
  const found = await prisma.employeeProfile.findFirst({
    where: { AND: [{ id: employeeId }, employeeWhere(scope)] },
    select: { id: true },
  });
  return found !== null;
}
