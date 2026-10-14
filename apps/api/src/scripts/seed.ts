// Deploy uchun idempotent seed: rollar/ruxsatlarni sinxronlaydi va super administrator
// bo'lmasa bittasini yaratadi. Qayta ishga tushirish xavfsiz.
//
//   npm run seed -w @nwi/api
//
// Administrator parolini SEED_ADMIN_PASSWORD bersangiz o'sha ishlatiladi, aks holda
// tasodifiy kuchli parol yaratiladi va bir marta chop etiladi.
import { randomBytes } from 'node:crypto';
import { emailSchema } from '@nwi/shared';
import { hashPassword, passwordProblem } from '../lib/password';
import { prisma } from '../lib/prisma';
import { syncRbacCatalog } from '../modules/rbac/sync';

const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@nordicuniversity.org').trim().toLowerCase();
const fullName = (process.env.SEED_ADMIN_NAME ?? 'Administrator').trim();

await syncRbacCatalog(prisma);
console.log('Rollar va ruxsatlar sinxronlandi.');

const existing = await prisma.user.findFirst({
  where: { roles: { some: { role: { code: 'SUPER_ADMIN' } } } },
  select: { email: true },
});
if (existing) {
  console.log(
    `Super administrator allaqachon mavjud (${existing.email}) — seed o'tkazib yuborildi.`,
  );
  await prisma.$disconnect();
  process.exit(0);
}

const parsedEmail = emailSchema.safeParse(email);
if (!parsedEmail.success) {
  console.error(`Xatolik: SEED_ADMIN_EMAIL noto'g'ri (${email})`);
  process.exit(1);
}

// Parolni tayyorlash: berilgan yoki tasodifiy (siyosatга mos bo'lguncha).
function randomPassword(): string {
  for (;;) {
    const candidate = `Nwi-${randomBytes(9).toString('base64url')}-${randomBytes(2).toString('hex')}`;
    if (!passwordProblem(candidate, { email: parsedEmail.data, fullName })) return candidate;
  }
}
const provided = process.env.SEED_ADMIN_PASSWORD;
if (provided) {
  const problem = passwordProblem(provided, { email: parsedEmail.data, fullName });
  if (problem) {
    console.error(`Xatolik: SEED_ADMIN_PASSWORD — ${problem}`);
    process.exit(1);
  }
}
const password = provided ?? randomPassword();

const role = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
const user = await prisma.$transaction(async (tx) => {
  const created = await tx.user.create({
    data: {
      email: parsedEmail.data,
      fullName,
      passwordHash: await hashPassword(password),
      // Parol aniq berilgan bo'lsa (deploy sozlamasi) — o'sha parol qoladi; aks holda
      // tasodifiy vaqtinchalik parol, birinchi kirishda almashtiriladi.
      mustChangePassword: !provided,
      roles: { create: { roleId: role.id } },
    },
  });
  await tx.auditLog.create({
    data: {
      action: 'user.create',
      entityType: 'User',
      entityId: created.id,
      diff: { via: 'seed', roles: ['SUPER_ADMIN'] },
    },
  });
  return created;
});
await prisma.$disconnect();

console.log('');
console.log('════════════════════════════════════════════════════════════');
console.log('  BIRINCHI ADMINISTRATOR YARATILDI');
console.log(`  Elektron pochta: ${user.email}`);
console.log(`  Parol: ${provided ? '(deploy sozlamasida berilgan)' : password}`);
console.log(
  provided
    ? '  Birinchi kirishda ikki bosqichli tasdiqlash (MFA) sozlanadi.'
    : '  Birinchi kirishda parol almashtiriladi va MFA sozlanadi.',
);
console.log('  Bu parolni xavfsiz joyga ko‘chirib oling.');
console.log('════════════════════════════════════════════════════════════');
