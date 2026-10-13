// Sinov (pilot) uchun yordamchi: admin panel tayyor bo'lguncha bitta xodimni agentga ulashga
// kerakli hamma narsani tayyorlaydi — xodim hisobi, sinov siyosati va ro'yxatdan o'tish kodi.
//
//   EMPLOYEE_EMAIL=aziz@nordic.uz EMPLOYEE_NAME="Aziz Karimov" npm run trial:setup -w @nwi/api
//
// Ixtiyoriy: SCREENSHOTS=on (ekran tasvirlarini yoqadi), SCREENSHOT_INTERVAL_SEC=60.
// Sinov siyosati kun bo'yi ishlaydi — haqiqiy joriy etishda ish jadvali bilan almashtiriladi.
import { emailSchema } from '@nwi/shared';
import { randomToken, sha256Hex } from '../lib/crypto';
import { hashPassword } from '../lib/password';
import { prisma } from '../lib/prisma';
import { agentConfigPublicKey } from '../lib/signing';
import { syncRbacCatalog } from '../modules/rbac/sync';

function fail(message: string): never {
  console.error(`Xatolik: ${message}`);
  process.exit(1);
}

const parsedEmail = emailSchema.safeParse(process.env.EMPLOYEE_EMAIL ?? '');
if (!parsedEmail.success) fail('EMPLOYEE_EMAIL berilmagan yoki noto‘g‘ri');
const email = parsedEmail.data;
const fullName = (process.env.EMPLOYEE_NAME ?? '').trim();
const screenshots = process.env.SCREENSHOTS === 'on';
const interval = Number(process.env.SCREENSHOT_INTERVAL_SEC ?? 60);
if (!Number.isInteger(interval) || interval < 60 || interval > 3600)
  fail('SCREENSHOT_INTERVAL_SEC 60–3600 oralig‘ida bo‘lishi kerak');

await syncRbacCatalog(prisma);
const admin = await prisma.user.findFirst({
  where: { isActive: true, roles: { some: { role: { code: 'SUPER_ADMIN' } } } },
  orderBy: { createdAt: 'asc' },
});
if (!admin) fail('avval administrator yarating: npm run admin:create -w @nwi/api');

let temporaryPassword: string | null = null;
let user = await prisma.user.findUnique({ where: { email }, include: { employee: true } });
if (!user) {
  if (fullName.length < 2) fail('yangi xodim uchun EMPLOYEE_NAME kerak');
  temporaryPassword = randomToken(12);
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'EMPLOYEE' } });
  user = await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      roles: { create: { roleId: role.id } },
      employee: { create: {} },
    },
    include: { employee: true },
  });
  await prisma.auditLog.create({
    data: {
      actorUserId: admin.id,
      action: 'user.create',
      entityType: 'User',
      entityId: user.id,
      diff: { via: 'trial-setup' },
    },
  });
}
const employee =
  user.employee ?? (await prisma.employeeProfile.create({ data: { userId: user.id } }));

const policyData = {
  workSchedule: { days: [1, 2, 3, 4, 5, 6, 7], start: '00:00', end: '23:59' },
  screenshotsEnabled: screenshots,
  screenshotIntervalSec: interval,
};
const policy = await prisma.monitoringPolicy.upsert({
  where: { name: 'Sinov siyosati' },
  create: { name: 'Sinov siyosati', ...policyData },
  update: { ...policyData, version: { increment: 1 } },
});
await prisma.policyAssignment.upsert({
  where: { employeeId: employee.id },
  create: { policyId: policy.id, employeeId: employee.id },
  update: { policyId: policy.id },
});

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const raw = Array.from(Buffer.from(randomToken(12), 'base64url').subarray(0, 12), (b) =>
  alphabet.charAt(b % alphabet.length),
);
const code = [raw.slice(0, 4), raw.slice(4, 8), raw.slice(8, 12)].map((g) => g.join('')).join('-');
await prisma.agentEnrollmentCode.create({
  data: {
    codeHash: sha256Hex(code),
    employeeId: employee.id,
    createdById: admin.id,
    expiresAt: new Date(Date.now() + 24 * 3_600_000),
  },
});
await prisma.auditLog.create({
  data: {
    actorUserId: admin.id,
    action: 'agent.enrollment_code.create',
    entityType: 'EmployeeProfile',
    entityId: employee.id,
    diff: { via: 'trial-setup', screenshots, policyId: policy.id },
  },
});
await prisma.$disconnect();

console.log(`Xodim:                    ${user.fullName} <${email}>`);
if (temporaryPassword)
  console.log(
    `Vaqtinchalik parol:       ${temporaryPassword}   (birinchi kirishda almashtiriladi)`,
  );
console.log(
  `Ekran tasvirlari:         ${screenshots ? `yoqilgan, har ${interval} soniyada` : 'o‘chirilgan'}`,
);
console.log(`Ro‘yxatdan o‘tish kodi:   ${code}   (24 soat amal qiladi, bir marta ishlatiladi)`);
console.log(`Konfiguratsiya kaliti:    ${agentConfigPublicKey}`);
