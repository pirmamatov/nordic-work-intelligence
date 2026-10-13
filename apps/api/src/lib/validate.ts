import type { z } from 'zod';
import { validationFailed } from './errors';

/** Sxema bo'yicha tekshiradi; xato bo'lsa maydonlar kesimidagi tafsilot bilan 422 qaytaradi. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw validationFailed(
      result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}
