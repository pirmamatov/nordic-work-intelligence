import { z } from 'zod';
import { emailSchema } from './auth';
import { ROLE_CODES } from './roles';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

export const employeeFieldsSchema = z.object({
  departmentId: z.uuid('Bo‘lim identifikatori noto‘g‘ri').nullable().optional(),
  position: optionalText(200).optional(),
  employeeNumber: optionalText(50).optional(),
  hiredAt: z.iso.date('Sana YYYY-MM-DD ko‘rinishida bo‘lishi kerak').nullable().optional(),
});

const rolesSchema = z
  .array(z.enum(ROLE_CODES))
  .min(1, 'Kamida bitta rol tanlang')
  .max(ROLE_CODES.length);

export const createUserSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2, 'Ism-familiyani kiriting').max(200),
  password: z.string().min(1, 'Vaqtinchalik parolni kiriting').max(128),
  roles: rolesSchema,
  employee: employeeFieldsSchema.optional(),
});

export const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200),
    isActive: z.boolean(),
    roles: rolesSchema,
    employee: employeeFieldsSchema,
  })
  .partial();

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(1, 'Yangi parolni kiriting').max(128),
});

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  departmentId: z.uuid().optional(),
  role: z.enum(ROLE_CODES).optional(),
  isActive: z.stringbool().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
