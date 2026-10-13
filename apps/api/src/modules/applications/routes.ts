import { Router } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { parse } from '../../lib/validate';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { recordAudit } from '../audit/service';

export const applicationsRouter = Router();

const CATEGORIES = [
  'OFFICE',
  'BROWSER',
  'AI',
  'COMMUNICATION',
  'PDF',
  'DEVELOPMENT',
  'SYSTEM',
  'OTHER',
] as const;
const RELEVANCE = ['WORK', 'NEUTRAL', 'NON_WORK', 'UNCLASSIFIED'] as const;

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
  workRelevance: z.enum(RELEVANCE).optional(),
});

const updateBody = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    category: z.enum(CATEGORIES),
    workRelevance: z.enum(RELEVANCE),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'O‘zgartiriladigan maydon ko‘rsatilmagan');

const idParams = z.object({ id: z.uuid() });

// Dasturlar katalogi shaxsiy ma'lumot emas — filtrlar va hisobotlar uchun hamma ko'radi.
applicationsRouter.get('/', requireAuth, async (req, res) => {
  const q = parse(listQuery, req.query);
  const items = await prisma.application.findMany({
    where: {
      ...(q.q
        ? {
            OR: [
              { displayName: { contains: q.q, mode: 'insensitive' } },
              { processName: { contains: q.q.toLowerCase() } },
            ],
          }
        : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.workRelevance ? { workRelevance: q.workRelevance } : {}),
    },
    orderBy: { displayName: 'asc' },
    select: { id: true, processName: true, displayName: true, category: true, workRelevance: true },
  });
  res.json({ items });
});

applicationsRouter.patch('/:id', requirePermission('applications.manage'), async (req, res) => {
  const { id } = parse(idParams, req.params);
  const input = parse(updateBody, req.body);
  const data = { ...input };
  const app = await prisma.$transaction(async (tx) => {
    if (!(await tx.application.findUnique({ where: { id }, select: { id: true } })))
      throw notFound('Dastur');
    const updated = await tx.application.update({
      where: { id },
      data,
      select: {
        id: true,
        processName: true,
        displayName: true,
        category: true,
        workRelevance: true,
      },
    });
    await recordAudit(
      req,
      { action: 'application.update', entityType: 'Application', entityId: id, diff: data },
      tx,
    );
    return updated;
  });
  res.json(app);
});
