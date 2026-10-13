import { z } from 'zod';

export const TASK_STATUSES = [
  'NEW',
  'PLANNED',
  'IN_PROGRESS',
  'IN_REVIEW',
  'NEEDS_FIX',
  'APPROVED',
  'DONE',
  'DELAYED',
  'CANCELLED',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Yakuniy holatlar: bulardan keyin topshiriq o'zgarmaydi. */
export const CLOSED_TASK_STATUSES: readonly TaskStatus[] = ['DONE', 'CANCELLED'];

// Ruxsat etilgan holat o'tishlari. Kim qaysi o'tishni bajara olishi serverda alohida tekshiriladi.
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  NEW: ['PLANNED', 'IN_PROGRESS', 'CANCELLED'],
  PLANNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['IN_REVIEW', 'DELAYED', 'CANCELLED'],
  DELAYED: ['IN_PROGRESS', 'IN_REVIEW', 'CANCELLED'],
  IN_REVIEW: ['APPROVED', 'NEEDS_FIX', 'CANCELLED'],
  NEEDS_FIX: ['IN_PROGRESS', 'IN_REVIEW', 'CANCELLED'],
  APPROVED: ['DONE', 'NEEDS_FIX'],
  DONE: [],
  CANCELLED: [],
};

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  text(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const createCriterionSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(
      /^[0-9A-Za-z][0-9A-Za-z.-]{0,29}$/,
      'Kod harf, raqam, nuqta va chiziqchadan iborat bo‘lishi kerak (masalan 3.2.1)',
    ),
  title: text(300).min(2, 'Mezon nomini kiriting'),
  description: optionalText(4000),
  direction: optionalText(200),
  parentId: z.uuid().nullable().optional(),
});
export const updateCriterionSchema = createCriterionSchema.partial();

const taskFields = {
  title: text(300).min(3, 'Topshiriq nomini kiriting'),
  description: optionalText(8000),
  direction: optionalText(200),
  criterionId: z.uuid().nullable().optional(),
  ownerId: z.uuid('Mas’ul xodimni tanlang'),
  collaboratorIds: z.array(z.uuid()).max(50),
  dueAt: z.iso.datetime({ offset: true, error: 'Muddatni kiriting' }),
  priority: z.enum(TASK_PRIORITIES),
  expectedResult: optionalText(4000),
};

export const createTaskSchema = z.object({
  ...taskFields,
  collaboratorIds: taskFields.collaboratorIds.default([]),
  priority: taskFields.priority.default('MEDIUM'),
});

// Sukut qiymatlarsiz: yuborilmagan maydon o'zgarmaydi (aks holda har bir tahrir ishtirokchilarni tozalab yuborardi).
export const updateTaskSchema = z
  .object({ ...taskFields, progressPct: z.int().min(0).max(100) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'O‘zgartiriladigan maydon ko‘rsatilmagan');

export const changeTaskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
  comment: optionalText(4000),
  delayReason: optionalText(2000),
});

export const taskCommentSchema = z.object({ body: text(4000).min(1, 'Izoh matnini kiriting') });

export const reviewDocumentSchema = z.object({
  decision: z.enum(['APPROVED', 'NEEDS_FIX']),
  note: optionalText(4000),
  // Tekshiruvchi bahosi, 1–5. Majburiy emas.
  qualityScore: z.int().min(1).max(5).nullable().optional(),
});

export type CreateCriterionInput = z.output<typeof createCriterionSchema>;
export type UpdateCriterionInput = z.output<typeof updateCriterionSchema>;
export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;
export type ChangeTaskStatusInput = z.output<typeof changeTaskStatusSchema>;
export type ReviewDocumentInput = z.output<typeof reviewDocumentSchema>;
