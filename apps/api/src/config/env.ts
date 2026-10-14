import 'dotenv/config';
import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    // Server tinglaydigan manzil. Native deployda 127.0.0.1 (faqat nginx orqali ko'rinadi),
    // Docker ichida 0.0.0.0 (host port mapping uchun).
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    ALLOWED_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    COOKIE_SECURE: z.stringbool().default(true),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine(
        (v) => Buffer.from(v, 'base64').length === 32,
        'base64 ko‘rinishidagi 32 baytli kalit bo‘lishi kerak',
      ),
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
    MFA_ENFORCED: z.stringbool().default(true),
    ORG_TIMEZONE: z.string().default('Asia/Tashkent'),
    LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(20),
    // Agent konfiguratsiyasini imzolash uchun Ed25519 kaliti: 32 baytli urug', base64.
    AGENT_CONFIG_SIGNING_KEY: z
      .string()
      .refine(
        (v) => Buffer.from(v, 'base64').length === 32,
        'base64 ko‘rinishidagi 32 baytli kalit bo‘lishi kerak',
      ),
    // Agent shu vaqt ichida aloqaga chiqmasa "oflayn" hisoblanadi.
    AGENT_ONLINE_WINDOW_SEC: z.coerce.number().int().positive().default(180),
    // Shifrlangan fayllar (ekran tasvirlari, hujjatlar) saqlanadigan papka. Veb-ildizdan tashqarida.
    STORAGE_DIR: z.string().min(1).default('storage'),
    SCREENSHOT_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 1024 * 1024),
    DOCUMENT_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(25 * 1024 * 1024),
    // RetentionPolicy jadvalida "screenshots" yozuvi bo'lmasa qo'llanadigan saqlash muddati.
    SCREENSHOT_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
    // Bundan eski faoliyat hodisalari qabul qilinmaydi.
    ACTIVITY_MAX_AGE_DAYS: z.coerce.number().int().positive().default(90),
  })
  .refine((v) => v.NODE_ENV !== 'production' || v.COOKIE_SECURE, {
    message: 'Ishlab chiqarish muhitida COOKIE_SECURE=true bo‘lishi shart',
    path: ['COOKIE_SECURE'],
  })
  .refine((v) => v.NODE_ENV !== 'production' || v.MFA_ENFORCED, {
    message: 'Ishlab chiqarish muhitida MFA_ENFORCED=true bo‘lishi shart',
    path: ['MFA_ENFORCED'],
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Qiymatlarning o'zi chiqarilmaydi — faqat qaysi o'zgaruvchi noto'g'ri ekani.
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Konfiguratsiya xatosi — ${problems}`);
}

export const env = parsed.data;
export type Env = typeof env;
