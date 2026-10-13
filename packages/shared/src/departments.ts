import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2, 'Bo‘lim nomini kiriting').max(200),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{1,29}$/, 'Kod 2–30 belgi: lotin harflari, raqamlar, "-" va "_"'),
  parentId: z.uuid().nullable().optional(),
  headUserId: z.uuid().nullable().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial();

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
