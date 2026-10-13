import type { Db } from '../../lib/prisma';
import { PERMISSIONS, ROLES, type PermissionCode, type RoleCode } from './catalog';

/** Katalogdagi ruxsat va tizim rollarini bazaga yozadi. Qayta ishga tushirish xavfsiz. */
export async function syncRbacCatalog(db: Db): Promise<void> {
  const permissionIds = new Map<string, string>();
  for (const code of Object.keys(PERMISSIONS) as PermissionCode[]) {
    const def: { description: string; requiresMfa?: boolean } = PERMISSIONS[code];
    const data = { description: def.description, requiresMfa: def.requiresMfa ?? false };
    const row = await db.permission.upsert({
      where: { code },
      create: { code, ...data },
      update: data,
    });
    permissionIds.set(code, row.id);
  }

  for (const code of Object.keys(ROLES) as RoleCode[]) {
    const def = ROLES[code];
    const data = { name: def.name, requiresMfa: def.requiresMfa, isSystem: true };
    const role = await db.role.upsert({ where: { code }, create: { code, ...data }, update: data });
    const wanted = def.permissions
      .map((p) => permissionIds.get(p))
      .filter((id): id is string => !!id);
    await db.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: wanted } },
    });
    await db.rolePermission.createMany({
      data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
}
