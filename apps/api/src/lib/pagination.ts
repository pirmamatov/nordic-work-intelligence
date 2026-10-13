import { z } from 'zod';

export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.uuid().optional(),
});

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** `limit + 1` ta yozuv so'ralgan natijani sahifaga aylantiradi. */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? last.id : null };
}

export function cursorArgs(page: { limit: number; cursor?: string | undefined }) {
  return {
    take: page.limit + 1,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
  };
}
