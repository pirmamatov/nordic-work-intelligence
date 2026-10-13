import { z } from 'zod';

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Vaqt HH:MM ko‘rinishida bo‘lishi kerak');

export const workScheduleSchema = z
  .object({
    // ISO hafta kunlari: 1 — dushanba, 7 — yakshanba.
    days: z.array(z.int().min(1).max(7)).min(1, 'Kamida bitta ish kunini tanlang').max(7),
    start: timeOfDay,
    end: timeOfDay,
  })
  .refine((v) => v.start < v.end, {
    message: 'Ish vaqti tugashi boshlanishidan keyin bo‘lishi kerak',
    path: ['end'],
  })
  .transform((v) => ({ ...v, days: [...new Set(v.days)].sort((a, b) => a - b) }));

const timezoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Vaqt zonasi noto‘g‘ri');

// Faqat fayl nomi (yo'lsiz) — yo'lda foydalanuvchi nomi kabi shaxsiy ma'lumot bo'lishi mumkin.
export const processNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(260)
  // eslint-disable-next-line no-control-regex -- boshqaruv belgilari ataylab taqiqlanadi
  .regex(/^[^\\/:*?"<>|\u0000-\u001f]+$/, 'Jarayon nomi yo‘lsiz fayl nomi bo‘lishi kerak');

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    'Domen nomi noto‘g‘ri',
  );

export const createPolicySchema = z.object({
  name: z.string().trim().min(2, 'Siyosat nomini kiriting').max(200),
  workSchedule: workScheduleSchema,
  timezone: timezoneSchema.default('Asia/Tashkent'),
  idleThresholdSec: z.int().min(30).max(3600).default(300),
  screenshotsEnabled: z.boolean().default(false),
  screenshotIntervalSec: z.int().min(60).max(3600).default(600),
  excludedProcesses: z.array(processNameSchema).max(200).default([]),
  allowedDomains: z.array(domainSchema).max(500).default([]),
  isDefault: z.boolean().default(false),
});

export const updatePolicySchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    workSchedule: workScheduleSchema,
    timezone: timezoneSchema,
    idleThresholdSec: z.int().min(30).max(3600),
    screenshotsEnabled: z.boolean(),
    screenshotIntervalSec: z.int().min(60).max(3600),
    excludedProcesses: z.array(processNameSchema).max(200),
    allowedDomains: z.array(domainSchema).max(500),
    isDefault: z.boolean(),
  })
  .partial();

// Aynan bitta nishon: bo'lim yoki xodim. policyId = null — biriktirishni olib tashlaydi.
export const assignPolicySchema = z
  .object({
    policyId: z.uuid().nullable(),
    departmentId: z.uuid().optional(),
    employeeId: z.uuid().optional(),
  })
  .refine((v) => (v.departmentId === undefined) !== (v.employeeId === undefined), {
    message: 'Bo‘lim yoki xodimdan aynan bittasini ko‘rsating',
  });

export type WorkSchedule = z.output<typeof workScheduleSchema>;
export type CreatePolicyInput = z.output<typeof createPolicySchema>;
export type UpdatePolicyInput = z.output<typeof updatePolicySchema>;
export type AssignPolicyInput = z.output<typeof assignPolicySchema>;
