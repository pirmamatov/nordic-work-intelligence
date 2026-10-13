import request from 'supertest';
import type { RoleCode } from '@nwi/shared';
import { createApp } from '../src/app';
import { csrfTokenFor, encryptSecret, randomToken, sha256Hex } from '../src/lib/crypto';
import { hashPassword } from '../src/lib/password';
import { prisma } from '../src/lib/prisma';
import { generateTotpSecret } from '../src/lib/totp';
import { ROLES } from '../src/modules/rbac/catalog';
import { syncRbacCatalog } from '../src/modules/rbac/sync';

export const app = createApp();
export const DEFAULT_PASSWORD = 'Togri-Parol-2026!';

let passwordHashCache: Promise<string> | undefined;
let tablesToTruncate: string | undefined;

/** Barcha jadvallarni tozalaydi (rollar va ruxsatlar katalogi qoladi). */
export async function resetDb(): Promise<void> {
  if (!tablesToTruncate) {
    await syncRbacCatalog(prisma);
    const rows = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
        AND c.relname NOT IN ('_prisma_migrations', 'Role', 'Permission', 'RolePermission')`;
    tablesToTruncate = rows.map((r) => `"${r.relname}"`).join(', ');
  }
  await prisma.$executeRawUnsafe(`TRUNCATE ${tablesToTruncate} RESTART IDENTITY CASCADE`);
}

let counter = 0;

export interface TestUserOptions {
  email?: string;
  fullName?: string;
  roles?: RoleCode[];
  departmentId?: string | null;
  /** false bo'lsa xodim profili yaratilmaydi. */
  employee?: boolean;
  /** Berilmasa: rol MFA talab qilsa yoqilgan, aks holda o'chirilgan. */
  mfa?: boolean;
  mustChangePassword?: boolean;
  isActive?: boolean;
}

export async function createUser(options: TestUserOptions = {}) {
  counter += 1;
  const roles = options.roles ?? ['EMPLOYEE'];
  const mfa = options.mfa ?? roles.some((r) => ROLES[r].requiresMfa);
  const mfaSecret = mfa ? generateTotpSecret() : null;
  passwordHashCache ??= hashPassword(DEFAULT_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email: options.email ?? `user${counter}@nordic.test`,
      fullName: options.fullName ?? `Test Foydalanuvchi ${counter}`,
      passwordHash: await passwordHashCache,
      isActive: options.isActive ?? true,
      mustChangePassword: options.mustChangePassword ?? false,
      mfaSecretEnc: mfaSecret ? encryptSecret(mfaSecret) : null,
      mfaEnabledAt: mfaSecret ? new Date() : null,
      roles: { create: roles.map((code) => ({ role: { connect: { code } } })) },
      ...(options.employee === false
        ? {}
        : {
            employee: {
              create: { departmentId: options.departmentId ?? null, position: 'Mutaxassis' },
            },
          }),
    },
    include: { employee: true },
  });
  return { ...user, mfaSecret, employeeId: user.employee?.id ?? null };
}

export async function createDepartment(
  code: string,
  extra: { parentId?: string; headUserId?: string } = {},
) {
  return prisma.department.create({ data: { code, name: `${code} bo‘limi`, ...extra } });
}

export interface TestSession {
  token: string;
  cookie: string;
  csrf: string;
  sessionId: string;
}

/** Kirish jarayonini chetlab, bevosita sessiya yaratadi (kirish oqimining o'zi alohida testlanadi). */
export async function sessionFor(
  userId: string,
  options: { mfaVerified?: boolean } = {},
): Promise<TestSession> {
  const token = randomToken(32);
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + 3_600_000),
      mfaVerifiedAt: options.mfaVerified === false ? null : new Date(),
    },
  });
  return { token, cookie: `nwi_sid=${token}`, csrf: csrfTokenFor(token), sessionId: session.id };
}

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** Sessiya cookie'si va CSRF tokeni qo'shilgan so'rov yuboruvchi. */
export function client(session?: TestSession) {
  const send = (method: Method) => (url: string) => {
    const req = request(app)[method](url);
    return session ? req.set('Cookie', session.cookie).set('X-CSRF-Token', session.csrf) : req;
  };
  return {
    get: send('get'),
    post: send('post'),
    patch: send('patch'),
    put: send('put'),
    delete: send('delete'),
  };
}

export async function loginAs(options: TestUserOptions = {}) {
  const user = await createUser(options);
  const session = await sessionFor(user.id);
  return { user, session, api: client(session) };
}

export { prisma };

/** Xodim uchun ro'yxatdan o'tgan agent yaratadi va uning tokenini qaytaradi. */
export async function enrollAgent(employeeId: string, machineId = `machine-${randomToken(8)}`) {
  const token = randomToken(32);
  const workstation = await prisma.workstation.create({
    data: { employeeId, hostname: 'PC-TEST', machineIdHash: sha256Hex(machineId) },
  });
  const installation = await prisma.agentInstallation.create({
    data: { workstationId: workstation.id, tokenHash: sha256Hex(token), agentVersion: '1.0.0' },
  });
  const post = (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`);
  const get = (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`);
  return { token, installationId: installation.id, workstationId: workstation.id, post, get };
}
