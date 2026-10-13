// Birinchi super administratorni yaratadi.
//   Interaktiv:     npm run admin:create -w @nwi/api
//   Avtomatlashgan: ADMIN_EMAIL, ADMIN_FULL_NAME, ADMIN_PASSWORD muhit o'zgaruvchilari orqali.
import { createInterface } from 'node:readline/promises';
import { emailSchema } from '@nwi/shared';
import { hashPassword, passwordProblem } from '../lib/password';
import { prisma } from '../lib/prisma';
import { syncRbacCatalog } from '../modules/rbac/sync';

async function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Parol terilayotganda ekranga chiqmaydi.
    const out = rl as unknown as { _writeToOutput: (text: string) => void };
    const write = out._writeToOutput.bind(rl);
    out._writeToOutput = (text) => {
      if (text.includes(question)) write(text);
    };
  }
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
    if (hidden) process.stdout.write('\n');
  }
}

function fail(message: string): never {
  console.error(`Xatolik: ${message}`);
  process.exit(1);
}

const emailInput = process.env.ADMIN_EMAIL ?? (await ask('Elektron pochta: '));
const parsedEmail = emailSchema.safeParse(emailInput);
if (!parsedEmail.success) fail('elektron pochta manzili noto‘g‘ri');
const email = parsedEmail.data;

const fullName = process.env.ADMIN_FULL_NAME ?? (await ask('Ism-familiya: '));
if (fullName.length < 2) fail('ism-familiya kiritilmadi');

const password = process.env.ADMIN_PASSWORD ?? (await ask('Parol: ', true));
const problem = passwordProblem(password, { email, fullName });
if (problem) fail(problem);
if (!process.env.ADMIN_PASSWORD && (await ask('Parolni takrorlang: ', true)) !== password) {
  fail('parollar mos kelmadi');
}

await syncRbacCatalog(prisma);
if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
  fail('bu elektron pochta bilan foydalanuvchi allaqachon mavjud');
}

const role = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
const passwordHash = await hashPassword(password);
const user = await prisma.$transaction(async (tx) => {
  const created = await tx.user.create({
    data: { email, fullName, passwordHash, roles: { create: { roleId: role.id } } },
  });
  await tx.auditLog.create({
    data: {
      action: 'user.create',
      entityType: 'User',
      entityId: created.id,
      diff: { via: 'cli', roles: ['SUPER_ADMIN'] },
    },
  });
  return created;
});
await prisma.$disconnect();

console.log(`Super administrator yaratildi: ${user.email}`);
console.log('Birinchi kirishda ikki bosqichli tasdiqlashni (MFA) sozlash talab qilinadi.');
