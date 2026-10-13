import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Elektron pochta manzili noto‘g‘ri').max(254));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Parolni kiriting').max(128),
});

export const mfaCodeSchema = z.object({
  // 6 raqamli TOTP kodi yoki zaxira kodi.
  code: z.string().trim().min(6, 'Kodni kiriting').max(32),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Joriy parolni kiriting').max(128),
  newPassword: z.string().min(1, 'Yangi parolni kiriting').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
