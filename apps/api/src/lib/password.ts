import { hash, verify } from '@node-rs/argon2';

// Argon2id (kutubxonaning sukut bo'yicha algoritmi), OWASP tavsiyasidagi minimal parametrlar.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const MIN_PASSWORD_LENGTH = 12;

const COMMON_PASSWORDS = new Set([
  'password1234',
  'qwerty123456',
  '123456789012',
  '1234567890ab',
  'qwertyuiop12',
  'admin1234567',
  'administrator',
  'parol1234567',
  'nordic123456',
  'iloveyou1234',
  'welcome12345',
  'letmein12345',
]);

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// Foydalanuvchi topilmaganda ham bir xil vaqt sarflanishi uchun (hisob mavjudligini oshkor qilmaslik).
let dummyHash: Promise<string> | undefined;
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}

/** Parol talabga javob bermasa sababini, aks holda null qaytaradi. */
export function passwordProblem(
  password: string,
  context: { email?: string; fullName?: string } = {},
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Parol kamida ${MIN_PASSWORD_LENGTH} ta belgidan iborat bo‘lishi kerak`;
  }
  if (password.length > 128) return 'Parol 128 belgidan oshmasligi kerak';
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return 'Bu parol juda keng tarqalgan, boshqasini tanlang';
  if (new Set(password).size < 5) return 'Parolda kamida 5 xil belgi bo‘lishi kerak';
  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lower.includes(localPart)) {
    return 'Parol elektron pochta manzilini o‘z ichiga olmasligi kerak';
  }
  return null;
}
